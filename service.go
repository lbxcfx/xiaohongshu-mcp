package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-rod/rod"
	"github.com/sirupsen/logrus"
	"github.com/xpzouying/xiaohongshu-mcp/browser"
	"github.com/xpzouying/xiaohongshu-mcp/configs"
	"github.com/xpzouying/xiaohongshu-mcp/cookies"
	xhsErrors "github.com/xpzouying/xiaohongshu-mcp/errors"
	"github.com/xpzouying/xiaohongshu-mcp/pkg/downloader"
	"github.com/xpzouying/xiaohongshu-mcp/pkg/xhsutil"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
)

// XiaohongshuService 小红书业务服务
type XiaohongshuService struct{}

type pendingLoginSession struct {
	mu           sync.Mutex
	browser      *browser.Browser
	page         *rod.Page
	action       *xiaohongshu.LoginAction
	deadline     time.Time
	initializing bool
	qrCodeImg    string
	cancel       context.CancelFunc
	authSeenAt   time.Time
}

var loginSession struct {
	mu           sync.Mutex
	activePageMu sync.Mutex
	pending      *pendingLoginSession
	active       *browser.Browser
	activePage   *rod.Page
}

var usernameLookup struct {
	mu          sync.Mutex
	inFlight    bool
	lastAttempt time.Time
}

// NewXiaohongshuService 创建小红书服务实例
func NewXiaohongshuService() *XiaohongshuService {
	return &XiaohongshuService{}
}

// PublishRequest 发布请求
type PublishRequest struct {
	Title      string   `json:"title" binding:"required"`
	Content    string   `json:"content" binding:"required"`
	Images     []string `json:"images" binding:"required,min=1"`
	Tags       []string `json:"tags,omitempty"`
	ScheduleAt string   `json:"schedule_at,omitempty"` // 定时发布时间，ISO8601格式，为空则立即发布
	IsOriginal bool     `json:"is_original,omitempty"` // 是否声明原创
	Visibility string   `json:"visibility,omitempty"`  // 可见范围: "公开可见"(默认), "仅自己可见", "仅互关好友可见"
	Products   []string `json:"products,omitempty"`    // 商品关键词列表，用于绑定带货商品
}

// LoginStatusResponse 登录状态响应
type LoginStatusResponse struct {
	Status                     string `json:"status"`
	IsLoggedIn                 bool   `json:"is_logged_in"`
	NeedsSecondaryVerification bool   `json:"needs_secondary_verification,omitempty"`
	Username                   string `json:"username,omitempty"`
	Detail                     string `json:"detail,omitempty"`
	Requirement                string `json:"requirement,omitempty"`
	QRCodeImage                string `json:"qrcode_image,omitempty"`
	HasPhoneInput              bool   `json:"has_phone_input,omitempty"`
	HasCodeInput               bool   `json:"has_code_input,omitempty"`
	CanSendPhoneCode           bool   `json:"can_send_phone_code,omitempty"`
	CanSubmitPhoneCode         bool   `json:"can_submit_phone_code,omitempty"`
	SessionTimeout             string `json:"session_timeout,omitempty"`
}

type SearchAccessResponse struct {
	Ready  bool   `json:"ready"`
	Detail string `json:"detail,omitempty"`
}

// LoginQrcodeResponse 登录扫码二维码
type LoginQrcodeResponse struct {
	Timeout    string `json:"timeout"`
	IsLoggedIn bool   `json:"is_logged_in"`
	Img        string `json:"img,omitempty"`
}

type PhoneLoginStartResponse struct {
	Timeout string `json:"timeout"`
	Detail  string `json:"detail,omitempty"`
}

type PhoneLoginActionResponse struct {
	Detail string `json:"detail,omitempty"`
}

// PublishResponse 发布响应
type PublishResponse struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	Images  int    `json:"images"`
	Status  string `json:"status"`
	PostID  string `json:"post_id,omitempty"`
}

// PublishVideoRequest 发布视频请求（仅支持本地单个视频文件）
type PublishVideoRequest struct {
	Title      string   `json:"title" binding:"required"`
	Content    string   `json:"content" binding:"required"`
	Video      string   `json:"video" binding:"required"`
	Tags       []string `json:"tags,omitempty"`
	ScheduleAt string   `json:"schedule_at,omitempty"` // 定时发布时间，ISO8601格式，为空则立即发布
	Visibility string   `json:"visibility,omitempty"`  // 可见范围: "公开可见"(默认), "仅自己可见", "仅互关好友可见"
	Products   []string `json:"products,omitempty"`    // 商品关键词列表，用于绑定带货商品
}

// PublishVideoResponse 发布视频响应
type PublishVideoResponse struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	Video   string `json:"video"`
	Status  string `json:"status"`
	PostID  string `json:"post_id,omitempty"`
}

// FeedsListResponse Feeds列表响应
type FeedsListResponse struct {
	Feeds []xiaohongshu.Feed `json:"feeds"`
	Count int                `json:"count"`
}

// UserProfileResponse 用户主页响应
type UserProfileResponse struct {
	UserBasicInfo xiaohongshu.UserBasicInfo      `json:"userBasicInfo"`
	Interactions  []xiaohongshu.UserInteractions `json:"interactions"`
	Feeds         []xiaohongshu.Feed             `json:"feeds"`
}

type cookieEntry struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Domain string `json:"domain"`
}

func createPendingLoginSession() *pendingLoginSession {
	b := newLoginBrowser()
	page := b.NewPage()
	return &pendingLoginSession{
		browser: b,
		page:    page,
		action:  xiaohongshu.NewLogin(page),
	}
}

func closePendingLoginSession(session *pendingLoginSession) {
	if session == nil {
		return
	}
	if session.page != nil {
		_ = session.page.Close()
		session.page = nil
	}
	if session.browser != nil {
		session.browser.Close()
		session.browser = nil
	}
	session.action = nil
}

func normalizeUsername(username string) string {
	if username != "" {
		return username
	}
	return "小红书用户"
}

func isPlaceholderUsername(username string) bool {
	return strings.TrimSpace(username) == normalizeUsername("")
}

func resolveProfileUsername(profile *UserProfileResponse) string {
	if profile == nil {
		return ""
	}

	if nickname := strings.TrimSpace(profile.UserBasicInfo.Nickname); nickname != "" {
		return nickname
	}

	return strings.TrimSpace(profile.UserBasicInfo.RedId)
}

func buildLoginStatusResponse(status, username, detail string) *LoginStatusResponse {
	response := &LoginStatusResponse{
		Status:   status,
		Username: username,
		Detail:   detail,
	}

	switch status {
	case string(xiaohongshu.LoginStateLoggedIn):
		response.IsLoggedIn = true
		response.Username = normalizeUsername(username)
	case string(xiaohongshu.LoginStateSecondaryRequired):
		response.NeedsSecondaryVerification = true
		if username != "" {
			response.Username = normalizeUsername(username)
		}
	case string(xiaohongshu.LoginStateWaitingVerification):
		// 保持默认值
	default:
		// 保持默认值
	}

	return response
}

func buildLoginStatusResponseFromFlow(flow *xiaohongshu.LoginFlowState, username, timeout string) *LoginStatusResponse {
	if flow == nil {
		return buildLoginStatusResponse(string(xiaohongshu.LoginStateUnknown), username, "")
	}

	response := buildLoginStatusResponse(string(flow.State), username, flow.Detail)
	response.Requirement = string(flow.Requirement)
	response.QRCodeImage = flow.QRCodeImage
	response.HasPhoneInput = flow.HasPhoneInput
	response.HasCodeInput = flow.HasCodeInput
	response.CanSendPhoneCode = flow.CanSendPhoneCode
	response.CanSubmitPhoneCode = flow.CanSubmitPhoneCode
	response.SessionTimeout = timeout
	return response
}

func hasSavedAuthCookies(data []byte) bool {
	var entries []cookieEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return false
	}

	for _, entry := range entries {
		if entry.Value == "" {
			continue
		}

		switch entry.Name {
		case "web_session", "web_session_id":
			return true
		case "a1", "webId", "gid":
			if entry.Domain != "" {
				return true
			}
		}
	}

	return false
}

func fetchUsernameFromPage(ctx context.Context, page *rod.Page) string {
	defer func() {
		if recovered := recover(); recovered != nil {
			logrus.Warnf("获取当前账号昵称时页面已失效: %v", recovered)
		}
	}()

	action := xiaohongshu.NewUserProfileAction(page)
	profile, err := action.GetMyProfileViaSidebar(ctx)
	if err != nil {
		logrus.Warnf("获取当前账号昵称失败: %v", err)
		return ""
	}

	username := profile.UserBasicInfo.Nickname
	if username == "" {
		username = profile.UserBasicInfo.RedId
	}
	return username
}

func (s *XiaohongshuService) getCurrentUsername(ctx context.Context) string {
	loginSession.mu.Lock()
	hasPendingLogin := loginSession.pending != nil
	active := loginSession.active
	activePage := loginSession.activePage
	loginSession.mu.Unlock()
	if hasPendingLogin {
		return ""
	}

	if active != nil && activePage != nil {
		loginSession.activePageMu.Lock()
		usernameCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		username := fetchUsernameFromPage(usernameCtx, activePage)
		cancel()
		loginSession.activePageMu.Unlock()
		if username != "" {
			return username
		}
	}

	if !beginUsernameLookup() {
		return ""
	}
	defer endUsernameLookup()

	defer func() {
		if recovered := recover(); recovered != nil {
			logrus.Warnf("??????????: %v", recovered)
		}
	}()

	var username string
	_ = withBrowserPage(func(page *rod.Page) error {
		usernameCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		username = fetchUsernameFromPage(usernameCtx, page)
		return nil
	})

	return username
}

func (s *XiaohongshuService) getCurrentUsernameWithFallback(ctx context.Context) (username string) {
	username = s.getCurrentUsername(ctx)
	if username != "" {
		return username
	}

	defer func() {
		if recovered := recover(); recovered != nil {
			logrus.Warnf("通过个人资料回填当前账号昵称时发生 panic: %v", recovered)
			username = ""
		}
	}()

	profileCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	profile, err := s.GetMyProfile(profileCtx)
	if err != nil {
		logrus.Warnf("通过个人资料回填当前账号昵称失败: %v", err)
		return ""
	}

	username = resolveProfileUsername(profile)
	return username
}

func beginUsernameLookup() bool {
	usernameLookup.mu.Lock()
	defer usernameLookup.mu.Unlock()

	if usernameLookup.inFlight {
		return false
	}
	if !usernameLookup.lastAttempt.IsZero() && time.Since(usernameLookup.lastAttempt) < 8*time.Second {
		return false
	}

	usernameLookup.inFlight = true
	usernameLookup.lastAttempt = time.Now()
	return true
}

func endUsernameLookup() {
	usernameLookup.mu.Lock()
	usernameLookup.inFlight = false
	usernameLookup.mu.Unlock()
}

// DeleteCookies 删除 cookies 文件，用于登录重置
func (s *XiaohongshuService) DeleteCookies(ctx context.Context) error {
	s.clearPendingLogin()
	s.clearActiveBrowser()

	cookiePath := cookies.GetCookiesFilePath()
	cookieLoader := cookies.NewLoadCookie(cookiePath)
	if err := cookieLoader.DeleteCookies(); err != nil {
		return err
	}
	if err := cookies.DeleteLoginState(); err != nil {
		return err
	}
	return browser.CleanupStaleBrowserProfile()
}

// CheckLoginStatus 检查登录状态
func (s *XiaohongshuService) CheckLoginStatus(ctx context.Context) (*LoginStatusResponse, error) {
	if state, err := cookies.LoadLoginState(); err == nil {
		switch state.Status {
		case string(xiaohongshu.LoginStateSecondaryRequired):
			return buildLoginStatusResponse(state.Status, state.Username, state.Detail), nil
		case string(xiaohongshu.LoginStateLoggedIn):
			if state.Username == "" || isPlaceholderUsername(state.Username) {
				username := s.getCurrentUsernameWithFallback(ctx)
				if username != "" {
					state.Username = username
					_ = cookies.SaveLoginState(*state)
				}
			}
			return buildLoginStatusResponse(state.Status, state.Username, state.Detail), nil
		case string(xiaohongshu.LoginStateWaitingVerification):
			if state.Detail != "" {
				return buildLoginStatusResponse(state.Status, state.Username, state.Detail), nil
			}
		}
	}

	if response, handled, err := s.checkPendingLoginStatus(ctx); handled {
		return response, err
	}

	return buildLoginStatusResponse(string(xiaohongshu.LoginStateUnknown), "", ""), nil
}

func (s *XiaohongshuService) CheckSearchAccess(ctx context.Context, keyword string) (*SearchAccessResponse, error) {
	var (
		ready  bool
		detail string
		err    error
	)
	err = s.withAuthenticatedPage(func(page *rod.Page) error {
		action := xiaohongshu.NewLogin(page)
		ready, detail, err = action.VerifySearchAccess(ctx, keyword)
		return err
	})
	if err != nil {
		return nil, err
	}

	return &SearchAccessResponse{
		Ready:  ready,
		Detail: detail,
	}, nil
}

// GetLoginQrcode 获取登录的扫码二维码
func (s *XiaohongshuService) GetLoginQrcode(ctx context.Context) (*LoginQrcodeResponse, error) {
	logrus.Info("开始获取登录二维码")
	loginSession.mu.Lock()
	existing := loginSession.pending
	loginSession.mu.Unlock()

	if existing != nil {
		existing.mu.Lock()
		authSeen := !existing.authSeenAt.IsZero()
		if !existing.initializing && existing.qrCodeImg != "" && time.Now().Before(existing.deadline) && !authSeen {
			timeout := time.Until(existing.deadline).Round(time.Second)
			img := existing.qrCodeImg
			existing.mu.Unlock()
			return &LoginQrcodeResponse{
				Timeout:    timeout.String(),
				Img:        img,
				IsLoggedIn: false,
			}, nil
		}
		existing.mu.Unlock()
	}

	s.clearPendingLogin()
	s.clearActiveBrowser()
	if err := browser.CleanupStaleBrowserProfile(); err != nil {
		logrus.Errorf("清理浏览器 profile 失败: %v", err)
		return nil, err
	}

	_ = cookies.SaveLoginState(cookies.LoginState{
		Status: string(xiaohongshu.LoginStateWaitingVerification),
	})

	session := &pendingLoginSession{
		deadline:     time.Now().Add(4 * time.Minute),
		initializing: true,
	}
	s.setPendingLogin(session)

	var (
		img      string
		loggedIn bool
		err      error
	)
	logrus.Info("浏览器启动成功，准备打开二维码页面")
	for attempt := 1; attempt <= 2; attempt++ {
		closePendingLoginSession(session)
		freshSession := createPendingLoginSession()
		session.browser = freshSession.browser
		session.page = freshSession.page
		session.action = freshSession.action

		attemptCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		img, loggedIn, err = session.action.FetchQrcodeImage(attemptCtx)
		cancel()
		if err == nil || loggedIn {
			break
		}
		logrus.Warnf("获取二维码第 %d 次失败: %v", attempt, err)
		if attempt == 2 {
			break
		}
		time.Sleep(1 * time.Second)
	}
	if err != nil || loggedIn {
		loginSession.mu.Lock()
		if loginSession.pending == session {
			loginSession.pending = nil
		}
		loginSession.mu.Unlock()
		defer closePendingLoginSession(session)
	}
	if err != nil {
		logrus.Errorf("获取二维码图片失败: %v", err)
		return nil, err
	}

	logrus.Infof("二维码获取完成，loggedIn=%v", loggedIn)

	timeout := 4 * time.Minute
	session.mu.Lock()
	session.deadline = time.Now().Add(timeout)
	session.initializing = false
	session.qrCodeImg = img
	session.mu.Unlock()

	if !loggedIn {
		s.setPendingLogin(session)
	} else {
		username := fetchUsernameFromPage(ctx, session.page)
		if err := saveCookies(session.page); err != nil {
			return nil, err
		}
		_ = cookies.SaveLoginState(cookies.LoginState{
			Status:   string(xiaohongshu.LoginStateLoggedIn),
			Username: username,
		})
	}

	return &LoginQrcodeResponse{
		Timeout: func() string {
			if loggedIn {
				return "0s"
			}
			return timeout.String()
		}(),
		Img:        img,
		IsLoggedIn: loggedIn,
	}, nil
}

func (s *XiaohongshuService) StartPhoneLogin(ctx context.Context) (*PhoneLoginStartResponse, error) {
	result, err := s.StartLoginSession(ctx)
	if err != nil {
		return nil, err
	}

	return &PhoneLoginStartResponse{
		Timeout: result.SessionTimeout,
		Detail:  result.Detail,
	}, nil
}

func (s *XiaohongshuService) StartLoginSession(ctx context.Context) (*LoginStatusResponse, error) {
	s.clearPendingLogin()
	s.clearActiveBrowser()
	if err := browser.CleanupStaleBrowserProfile(); err != nil {
		return nil, err
	}

	session := &pendingLoginSession{
		deadline:     time.Now().Add(5 * time.Minute),
		initializing: true,
	}
	s.setPendingLogin(session)

	freshSession := createPendingLoginSession()
	session.browser = freshSession.browser
	session.page = freshSession.page
	session.action = freshSession.action

	prepareCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if err := session.action.PrepareLoginFlow(prepareCtx); err != nil {
		s.clearPendingLogin()
		return nil, err
	}

	session.mu.Lock()
	session.initializing = false
	session.mu.Unlock()

	status, handled, err := s.checkPendingLoginStatus(ctx)
	if handled {
		return status, err
	}

	return &LoginStatusResponse{
		Status:         string(xiaohongshu.LoginStateWaitingVerification),
		IsLoggedIn:     false,
		Detail:         "official login page opened",
		SessionTimeout: "5m0s",
	}, nil
}

func (s *XiaohongshuService) SendPhoneLoginCode(ctx context.Context, phone string) (*PhoneLoginActionResponse, error) {
	session, err := s.getPendingLoginSession()
	if err != nil {
		return nil, err
	}

	session.mu.Lock()
	action := session.action
	session.mu.Unlock()

	stepCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if err := action.PreparePhoneLoginPage(stepCtx); err != nil {
		return nil, err
	}
	if err := action.FillPhoneNumber(stepCtx, phone); err != nil {
		return nil, err
	}
	if err := action.RequestPhoneCode(stepCtx); err != nil {
		return nil, err
	}

	return &PhoneLoginActionResponse{
		Detail: "verification code requested",
	}, nil
}

func (s *XiaohongshuService) VerifyPhoneLoginCode(ctx context.Context, code string) (*PhoneLoginActionResponse, error) {
	session, err := s.getPendingLoginSession()
	if err != nil {
		return nil, err
	}

	session.mu.Lock()
	action := session.action
	session.mu.Unlock()

	stepCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if err := action.SubmitPhoneCode(stepCtx, code); err != nil {
		return nil, err
	}

	return &PhoneLoginActionResponse{
		Detail: "verification code submitted, waiting login confirmation",
	}, nil
}

func (s *XiaohongshuService) setPendingLogin(session *pendingLoginSession) {
	loginSession.mu.Lock()
	defer loginSession.mu.Unlock()
	loginSession.pending = session
}

func (s *XiaohongshuService) getPendingLoginSession() (*pendingLoginSession, error) {
	loginSession.mu.Lock()
	session := loginSession.pending
	loginSession.mu.Unlock()
	if session == nil {
		return nil, fmt.Errorf("no active login session")
	}
	return session, nil
}

func (s *XiaohongshuService) clearPendingLogin() {
	loginSession.mu.Lock()
	session := loginSession.pending
	loginSession.pending = nil
	loginSession.mu.Unlock()

	if session == nil {
		return
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.cancel != nil {
		session.cancel()
		session.cancel = nil
	}
	if session.page != nil {
		_ = session.page.Close()
		session.page = nil
	}
	if session.browser != nil {
		session.browser.Close()
		session.browser = nil
	}
}

func (s *XiaohongshuService) checkPendingLoginStatus(ctx context.Context) (*LoginStatusResponse, bool, error) {
	loginSession.mu.Lock()
	session := loginSession.pending
	loginSession.mu.Unlock()

	if session == nil {
		return nil, false, nil
	}

	session.mu.Lock()
	if session.initializing {
		session.mu.Unlock()
		return buildLoginStatusResponse(string(xiaohongshu.LoginStateWaitingVerification), "", ""), true, nil
	}
	deadline := session.deadline
	action := session.action
	page := session.page
	pageReady := page != nil && session.browser != nil && action != nil
	session.mu.Unlock()

	if !pageReady {
		go s.clearPendingLogin()
		return nil, false, nil
	}

	if time.Now().After(deadline) {
		_ = cookies.SaveLoginState(cookies.LoginState{
			Status: string(xiaohongshu.LoginStateUnknown),
			Detail: "login session expired",
		})
		go s.clearPendingLogin()
		return buildLoginStatusResponse(string(xiaohongshu.LoginStateUnknown), "", "login session expired"), true, nil
	}

	timeout := time.Until(deadline).Round(time.Second).String()

	statusCtx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	flow, err := action.InspectLoginFlow(statusCtx)
	if err != nil {
		if isPageTargetGoneError(err) {
			recovered, recoverErr := s.recoverPendingLoginAfterPageLoss(session)
			if recoverErr != nil {
				return nil, true, recoverErr
			}
			if recovered != nil {
				return recovered, true, nil
			}
		}
		return nil, true, err
	}
	state := flow.State
	detail := flow.Detail
	logrus.Infof("pending login status: %s, requirement: %s, detail: %s", state, flow.Requirement, detail)

	if state == xiaohongshu.LoginStateWaitingVerification && detail == "auth cookies detected, waiting modal close" {
		session.mu.Lock()
		if session.authSeenAt.IsZero() {
			session.authSeenAt = time.Now()
			session.qrCodeImg = ""
			logrus.Info("pending login qrcode marked as consumed")
		}
		authSeenAt := session.authSeenAt
		session.mu.Unlock()

		if time.Since(authSeenAt) >= 3*time.Second {
			confirmed, confirmDetail, confirmErr := s.confirmPendingLogin(action)
			if confirmErr != nil {
				logrus.Warnf("confirm pending login failed: %v", confirmErr)
			}
			if confirmed {
				state = xiaohongshu.LoginStateLoggedIn
				detail = confirmDetail
			} else if confirmDetail != "" {
				detail = confirmDetail
			}
		}
	}

	switch state {
	case xiaohongshu.LoginStateLoggedIn:
		username := s.fetchUsernameFromPendingBrowser(session)
		if err := saveCookies(page); err != nil {
			return nil, true, err
		}
		_ = cookies.SaveLoginState(cookies.LoginState{
			Status:   string(xiaohongshu.LoginStateLoggedIn),
			Username: username,
		})
		flow.State = xiaohongshu.LoginStateLoggedIn
		flow.Requirement = xiaohongshu.LoginRequirementNone
		response := buildLoginStatusResponseFromFlow(flow, username, timeout)
		s.promotePendingLogin(session)
		return response, true, nil
	case xiaohongshu.LoginStateSecondaryRequired:
		_ = cookies.SaveLoginState(cookies.LoginState{
			Status: string(xiaohongshu.LoginStateSecondaryRequired),
			Detail: detail,
		})
		return buildLoginStatusResponseFromFlow(flow, "", timeout), true, nil
	default:
		return buildLoginStatusResponseFromFlow(flow, "", timeout), true, nil
	}
}

func isPageTargetGoneError(err error) bool {
	if err == nil {
		return false
	}

	message := err.Error()
	return strings.Contains(message, "Inspected target navigated or closed") ||
		strings.Contains(message, "Cannot find context with specified id") ||
		strings.Contains(message, "target closed")
}

func (s *XiaohongshuService) recoverPendingLoginAfterPageLoss(session *pendingLoginSession) (*LoginStatusResponse, error) {
	if session == nil || session.page == nil || session.browser == nil {
		go s.clearPendingLogin()
		return buildLoginStatusResponse(string(xiaohongshu.LoginStateUnknown), "", "login page closed before confirmation"), nil
	}

	hasAuth, err := hasPageAuthCookies(session.page)
	if err != nil {
		return nil, err
	}
	if !hasAuth {
		go s.clearPendingLogin()
		return buildLoginStatusResponse(string(xiaohongshu.LoginStateUnknown), "", "login page closed before auth cookies were ready"), nil
	}

	if err := saveCookies(session.page); err != nil {
		return nil, err
	}

	username := s.fetchUsernameFromPendingBrowser(session)
	_ = cookies.SaveLoginState(cookies.LoginState{
		Status:   string(xiaohongshu.LoginStateLoggedIn),
		Username: username,
	})

	response := buildLoginStatusResponse(string(xiaohongshu.LoginStateLoggedIn), username, "login recovered after page redirect")
	go s.clearPendingLogin()
	return response, nil
}

func hasPageAuthCookies(page *rod.Page) (bool, error) {
	cks, err := page.Browser().GetCookies()
	if err != nil {
		return false, err
	}

	for _, ck := range cks {
		if ck == nil {
			continue
		}

		switch ck.Name {
		case "web_session", "web_session_id":
			if ck.Value != "" {
				return true, nil
			}
		case "a1", "webId", "gid":
			if ck.Domain != "" && strings.Contains(ck.Domain, "xiaohongshu.com") {
				return true, nil
			}
		}
	}

	return false, nil
}

func (s *XiaohongshuService) fetchUsernameFromPendingBrowser(session *pendingLoginSession) string {
	if session == nil || session.browser == nil {
		return ""
	}

	page := session.browser.NewPage()
	if page == nil {
		return ""
	}
	defer page.Close()

	usernameCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return fetchUsernameFromPage(usernameCtx, page)
}

func (s *XiaohongshuService) watchPendingLogin(ctx context.Context, session *pendingLoginSession) {
	defer func() {
		if recovered := recover(); recovered != nil {
			logrus.Errorf("login watcher panic: %v", recovered)
			_ = cookies.SaveLoginState(cookies.LoginState{
				Status: string(xiaohongshu.LoginStateUnknown),
				Detail: fmt.Sprint(recovered),
			})
			s.clearPendingLogin()
		}
	}()

	session.mu.Lock()
	action := session.action
	page := session.page
	session.mu.Unlock()

	if action == nil || page == nil {
		return
	}

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			_ = cookies.SaveLoginState(cookies.LoginState{
				Status: string(xiaohongshu.LoginStateUnknown),
				Detail: "login session expired",
			})
			s.clearPendingLogin()
			return
		case <-ticker.C:
			state, detail := action.DetectLoginState(ctx)
			logrus.Infof("login watcher status: %s, detail: %s", state, detail)

			switch state {
			case xiaohongshu.LoginStateLoggedIn:
				if err := saveCookies(page); err != nil {
					logrus.Errorf("保存登录 cookies 失败: %v", err)
					_ = cookies.SaveLoginState(cookies.LoginState{
						Status: string(xiaohongshu.LoginStateUnknown),
						Detail: err.Error(),
					})
					s.clearPendingLogin()
					return
				}
				_ = cookies.SaveLoginState(cookies.LoginState{
					Status: string(xiaohongshu.LoginStateLoggedIn),
				})
				s.clearPendingLogin()
				return
			case xiaohongshu.LoginStateSecondaryRequired:
				_ = cookies.SaveLoginState(cookies.LoginState{
					Status: string(xiaohongshu.LoginStateSecondaryRequired),
					Detail: detail,
				})
				s.clearPendingLogin()
				return
			}
		}
	}
}

// PublishContent 发布内容
func (s *XiaohongshuService) PublishContent(ctx context.Context, req *PublishRequest) (*PublishResponse, error) {
	// 验证标题长度（小红书限制：最大20个字）
	if xhsutil.CalcTitleLength(req.Title) > 20 {
		return nil, fmt.Errorf("标题长度超过限制")
	}

	// 处理图片：下载URL图片或使用本地路径
	imagePaths, err := s.processImages(req.Images)
	if err != nil {
		return nil, err
	}

	// 解析定时发布时间
	var scheduleTime *time.Time
	if req.ScheduleAt != "" {
		t, err := time.Parse(time.RFC3339, req.ScheduleAt)
		if err != nil {
			return nil, fmt.Errorf("定时发布时间格式错误，请使用 ISO8601 格式: %v", err)
		}

		// 校验定时发布时间范围：1小时至14天
		now := time.Now()
		minTime := now.Add(1 * time.Hour)
		maxTime := now.Add(14 * 24 * time.Hour)

		if t.Before(minTime) {
			return nil, fmt.Errorf("定时发布时间必须至少在1小时后，当前设置: %s，最早可选: %s",
				t.Format("2006-01-02 15:04"), minTime.Format("2006-01-02 15:04"))
		}
		if t.After(maxTime) {
			return nil, fmt.Errorf("定时发布时间不能超过14天，当前设置: %s，最晚可选: %s",
				t.Format("2006-01-02 15:04"), maxTime.Format("2006-01-02 15:04"))
		}

		scheduleTime = &t
		logrus.Infof("设置定时发布时间: %s", t.Format("2006-01-02 15:04"))
	}

	// 构建发布内容
	content := xiaohongshu.PublishImageContent{
		Title:        req.Title,
		Content:      req.Content,
		Tags:         req.Tags,
		ImagePaths:   imagePaths,
		ScheduleTime: scheduleTime,
		IsOriginal:   req.IsOriginal,
		Visibility:   req.Visibility,
		Products:     req.Products,
	}

	// 执行发布
	if err := s.publishContent(ctx, content); err != nil {
		logrus.Errorf("发布内容失败: title=%s %v", content.Title, err)
		return nil, err
	}

	response := &PublishResponse{
		Title:   req.Title,
		Content: req.Content,
		Images:  len(imagePaths),
		Status:  "发布完成",
	}

	return response, nil
}

// processImages 处理图片列表，支持URL下载和本地路径
func (s *XiaohongshuService) processImages(images []string) ([]string, error) {
	processor := downloader.NewImageProcessor()
	return processor.ProcessImages(images)
}

// publishContent 执行内容发布
func (s *XiaohongshuService) publishContent(ctx context.Context, content xiaohongshu.PublishImageContent) error {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action, err := xiaohongshu.NewPublishImageAction(page)
	if err != nil {
		return err
	}

	// 执行发布
	return action.Publish(ctx, content)
}

// PublishVideo 发布视频（本地文件）
func (s *XiaohongshuService) PublishVideo(ctx context.Context, req *PublishVideoRequest) (*PublishVideoResponse, error) {
	// 标题长度校验（小红书限制：最大20个字）
	if xhsutil.CalcTitleLength(req.Title) > 20 {
		return nil, fmt.Errorf("标题长度超过限制")
	}

	// 本地视频文件校验
	if req.Video == "" {
		return nil, fmt.Errorf("必须提供本地视频文件")
	}
	if _, err := os.Stat(req.Video); err != nil {
		return nil, fmt.Errorf("视频文件不存在或不可访问: %v", err)
	}

	// 解析定时发布时间
	var scheduleTime *time.Time
	if req.ScheduleAt != "" {
		t, err := time.Parse(time.RFC3339, req.ScheduleAt)
		if err != nil {
			return nil, fmt.Errorf("定时发布时间格式错误，请使用 ISO8601 格式: %v", err)
		}

		// 校验定时发布时间范围：1小时至14天
		now := time.Now()
		minTime := now.Add(1 * time.Hour)
		maxTime := now.Add(14 * 24 * time.Hour)

		if t.Before(minTime) {
			return nil, fmt.Errorf("定时发布时间必须至少在1小时后，当前设置: %s，最早可选: %s",
				t.Format("2006-01-02 15:04"), minTime.Format("2006-01-02 15:04"))
		}
		if t.After(maxTime) {
			return nil, fmt.Errorf("定时发布时间不能超过14天，当前设置: %s，最晚可选: %s",
				t.Format("2006-01-02 15:04"), maxTime.Format("2006-01-02 15:04"))
		}

		scheduleTime = &t
		logrus.Infof("设置定时发布时间: %s", t.Format("2006-01-02 15:04"))
	}

	// 构建发布内容
	content := xiaohongshu.PublishVideoContent{
		Title:        req.Title,
		Content:      req.Content,
		Tags:         req.Tags,
		VideoPath:    req.Video,
		ScheduleTime: scheduleTime,
		Visibility:   req.Visibility,
		Products:     req.Products,
	}

	// 执行发布
	if err := s.publishVideo(ctx, content); err != nil {
		return nil, err
	}

	resp := &PublishVideoResponse{
		Title:   req.Title,
		Content: req.Content,
		Video:   req.Video,
		Status:  "发布完成",
	}
	return resp, nil
}

// publishVideo 执行视频发布
func (s *XiaohongshuService) publishVideo(ctx context.Context, content xiaohongshu.PublishVideoContent) error {
	b := newIsolatedBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action, err := xiaohongshu.NewPublishVideoAction(page)
	if err != nil {
		return err
	}

	return action.PublishVideo(ctx, content)
}

// ListFeeds 获取Feeds列表
func (s *XiaohongshuService) ListFeeds(ctx context.Context) (*FeedsListResponse, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	// 创建 Feeds 列表 action
	action := xiaohongshu.NewFeedsListAction(page)

	// 获取 Feeds 列表
	feeds, err := action.GetFeedsList(ctx)
	if err != nil {
		logrus.Errorf("获取 Feeds 列表失败: %v", err)
		return nil, err
	}

	response := &FeedsListResponse{
		Feeds: feeds,
		Count: len(feeds),
	}

	return response, nil
}

func (s *XiaohongshuService) SearchFeeds(ctx context.Context, keyword string, filters ...xiaohongshu.FilterOption) (*FeedsListResponse, error) {
	var feeds []xiaohongshu.Feed
	err := s.withAuthenticatedPage(func(page *rod.Page) error {
		action := xiaohongshu.NewSearchAction(page)
		var searchErr error
		feeds, searchErr = action.Search(ctx, keyword, filters...)
		return searchErr
	})
	if err != nil {
		if err == xhsErrors.ErrSearchLoginRequired {
			_ = cookies.SaveLoginState(cookies.LoginState{
				Status: string(xiaohongshu.LoginStateUnknown),
				Detail: err.Error(),
			})
		}
		return nil, err
	}

	response := &FeedsListResponse{
		Feeds: feeds,
		Count: len(feeds),
	}

	return response, nil
}

// GetFeedDetail 获取Feed详情
func (s *XiaohongshuService) GetFeedDetail(ctx context.Context, feedID, xsecToken string, loadAllComments bool) (*FeedDetailResponse, error) {
	return s.GetFeedDetailWithConfig(ctx, feedID, xsecToken, loadAllComments, xiaohongshu.DefaultCommentLoadConfig())
}

// GetFeedDetailWithConfig 使用配置获取Feed详情
func (s *XiaohongshuService) GetFeedDetailWithConfig(ctx context.Context, feedID, xsecToken string, loadAllComments bool, config xiaohongshu.CommentLoadConfig) (*FeedDetailResponse, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	// 创建 Feed 详情 action
	action := xiaohongshu.NewFeedDetailAction(page)

	// 获取 Feed 详情
	result, err := action.GetFeedDetailWithConfig(ctx, feedID, xsecToken, loadAllComments, config)
	if err != nil {
		return nil, err
	}

	response := &FeedDetailResponse{
		FeedID: feedID,
		Data:   result,
	}

	return response, nil
}

// UserProfile 获取用户信息
func (s *XiaohongshuService) UserProfile(ctx context.Context, userID, xsecToken string) (*UserProfileResponse, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewUserProfileAction(page)

	result, err := action.UserProfile(ctx, userID, xsecToken)
	if err != nil {
		return nil, err
	}
	response := &UserProfileResponse{
		UserBasicInfo: result.UserBasicInfo,
		Interactions:  result.Interactions,
		Feeds:         result.Feeds,
	}

	return response, nil

}

// PostCommentToFeed 发表评论到Feed
func (s *XiaohongshuService) PostCommentToFeed(ctx context.Context, feedID, xsecToken, content string) (*PostCommentResponse, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewCommentFeedAction(page)

	if err := action.PostComment(ctx, feedID, xsecToken, content); err != nil {
		return nil, err
	}

	return &PostCommentResponse{FeedID: feedID, Success: true, Message: "评论发表成功"}, nil
}

// LikeFeed 点赞笔记
func (s *XiaohongshuService) LikeFeed(ctx context.Context, feedID, xsecToken string) (*ActionResult, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewLikeAction(page)
	if err := action.Like(ctx, feedID, xsecToken); err != nil {
		return nil, err
	}
	return &ActionResult{FeedID: feedID, Success: true, Message: "点赞成功或已点赞"}, nil
}

// UnlikeFeed 取消点赞笔记
func (s *XiaohongshuService) UnlikeFeed(ctx context.Context, feedID, xsecToken string) (*ActionResult, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewLikeAction(page)
	if err := action.Unlike(ctx, feedID, xsecToken); err != nil {
		return nil, err
	}
	return &ActionResult{FeedID: feedID, Success: true, Message: "取消点赞成功或未点赞"}, nil
}

// FavoriteFeed 收藏笔记
func (s *XiaohongshuService) FavoriteFeed(ctx context.Context, feedID, xsecToken string) (*ActionResult, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewFavoriteAction(page)
	if err := action.Favorite(ctx, feedID, xsecToken); err != nil {
		return nil, err
	}
	return &ActionResult{FeedID: feedID, Success: true, Message: "收藏成功或已收藏"}, nil
}

// UnfavoriteFeed 取消收藏笔记
func (s *XiaohongshuService) UnfavoriteFeed(ctx context.Context, feedID, xsecToken string) (*ActionResult, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewFavoriteAction(page)
	if err := action.Unfavorite(ctx, feedID, xsecToken); err != nil {
		return nil, err
	}
	return &ActionResult{FeedID: feedID, Success: true, Message: "取消收藏成功或未收藏"}, nil
}

// ReplyCommentToFeed 回复指定评论
func (s *XiaohongshuService) ReplyCommentToFeed(ctx context.Context, feedID, xsecToken, commentID, userID, content string) (*ReplyCommentResponse, error) {
	b := newBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewCommentFeedAction(page)

	if err := action.ReplyToComment(ctx, feedID, xsecToken, commentID, userID, content); err != nil {
		return nil, err
	}

	return &ReplyCommentResponse{
		FeedID:          feedID,
		TargetCommentID: commentID,
		TargetUserID:    userID,
		Success:         true,
		Message:         "评论回复成功",
	}, nil
}

func newBrowser() *browser.Browser {
	return browser.NewBrowser(configs.IsHeadless(), browser.WithBinPath(configs.GetBinPath()))
}

func newLoginBrowser() *browser.Browser {
	return browser.NewBrowser(false, browser.WithBinPath(configs.GetBinPath()))
}

func newIsolatedBrowser() *browser.Browser {
	userDataDir, err := browser.CloneUserDataDirToTemp()
	if err != nil {
		logrus.Warnf("克隆浏览器 profile 失败，改用空临时 profile: %v", err)
		userDataDir, err = os.MkdirTemp("", "xhs-browser-task-*")
		if err != nil {
			logrus.Warnf("创建临时浏览器 profile 失败，回退默认 profile: %v", err)
			return newBrowser()
		}
	}

	return browser.NewBrowser(
		configs.IsHeadless(),
		browser.WithBinPath(configs.GetBinPath()),
		browser.WithUserDataDir(userDataDir),
	)
}

func saveCookies(page *rod.Page) error {
	cks, err := page.Browser().GetCookies()
	if err != nil {
		return err
	}

	data, err := json.Marshal(cks)
	if err != nil {
		return err
	}

	cookieLoader := cookies.NewLoadCookie(cookies.GetCookiesFilePath())
	return cookieLoader.SaveCookies(data)
}

// withBrowserPage 执行需要浏览器页面的操作的通用函数
func withBrowserPage(fn func(*rod.Page) error) error {
	b := newIsolatedBrowser()
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	return fn(page)
}

func (s *XiaohongshuService) withAuthenticatedPage(fn func(*rod.Page) error) error {
	loginSession.mu.Lock()
	active := loginSession.active
	activePage := loginSession.activePage
	loginSession.mu.Unlock()

	if active != nil && activePage != nil {
		loginSession.activePageMu.Lock()
		defer loginSession.activePageMu.Unlock()
		return fn(activePage)
	}

	if active != nil {
		page := active.NewPage()
		defer page.Close()
		return fn(page)
	}

	return withBrowserPage(fn)
}

func (s *XiaohongshuService) confirmPendingLogin(current *xiaohongshu.LoginAction) (bool, string, error) {
	if current == nil {
		return false, "", nil
	}

	checkCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	confirmed, detail, err := current.ConfirmLoggedIn(checkCtx)
	if err != nil {
		return false, "", err
	}
	if confirmed {
		return true, detail, nil
	}

	// 预留手机确认时间后，再用当前页做一次正式登录检查。
	navigateCtx, navigateCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer navigateCancel()

	confirmed, err = current.CheckLoginStatusFast(navigateCtx)
	if err != nil {
		return false, "", err
	}
	if confirmed {
		return true, "login confirmed", nil
	}

	return false, "", nil
}

func (s *XiaohongshuService) clearActiveBrowser() {
	loginSession.mu.Lock()
	active := loginSession.active
	activePage := loginSession.activePage
	loginSession.active = nil
	loginSession.activePage = nil
	loginSession.mu.Unlock()

	if activePage != nil {
		_ = activePage.Close()
	}
	if active != nil {
		active.Close()
	}
}

func (s *XiaohongshuService) promotePendingLogin(session *pendingLoginSession) {
	loginSession.mu.Lock()
	if loginSession.pending == session {
		loginSession.pending = nil
	}
	oldActive := loginSession.active
	oldActivePage := loginSession.activePage
	loginSession.active = session.browser
	loginSession.activePage = session.page
	loginSession.mu.Unlock()

	if oldActivePage != nil && oldActivePage != session.page {
		_ = oldActivePage.Close()
	}
	if oldActive != nil && oldActive != session.browser {
		oldActive.Close()
	}

	session.mu.Lock()
	session.page = nil
	session.browser = nil
	session.cancel = nil
	session.mu.Unlock()
}

// GetMyProfile 获取当前登录用户的个人信息
func (s *XiaohongshuService) GetMyProfile(ctx context.Context) (*UserProfileResponse, error) {
	var result *xiaohongshu.UserProfileResponse
	var err error

	err = s.withAuthenticatedPage(func(page *rod.Page) error {
		action := xiaohongshu.NewUserProfileAction(page)
		result, err = action.GetMyProfileViaSidebar(ctx)
		return err
	})

	if err != nil {
		return nil, err
	}

	response := &UserProfileResponse{
		UserBasicInfo: result.UserBasicInfo,
		Interactions:  result.Interactions,
		Feeds:         result.Feeds,
	}

	return response, nil
}
