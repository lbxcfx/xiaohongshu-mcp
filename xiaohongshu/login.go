package xiaohongshu

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
	xhserrors "github.com/xpzouying/xiaohongshu-mcp/errors"
)

type LoginAction struct {
	page *rod.Page
}

type LoginState string

type LoginRequirement string

type LoginFlowState struct {
	State              LoginState       `json:"state"`
	Requirement        LoginRequirement `json:"requirement,omitempty"`
	Detail             string           `json:"detail,omitempty"`
	QRCodeImage        string           `json:"qrcode_image,omitempty"`
	HasPhoneInput      bool             `json:"has_phone_input,omitempty"`
	HasCodeInput       bool             `json:"has_code_input,omitempty"`
	CanSendPhoneCode   bool             `json:"can_send_phone_code,omitempty"`
	CanSubmitPhoneCode bool             `json:"can_submit_phone_code,omitempty"`
}

const (
	LoginStateUnknown             LoginState = "unknown"
	LoginStateLoggedIn            LoginState = "logged_in"
	LoginStateSecondaryRequired   LoginState = "secondary_required"
	LoginStateWaitingVerification LoginState = "waiting_verification"
)

const (
	LoginRequirementNone      LoginRequirement = "none"
	LoginRequirementQRCode    LoginRequirement = "qrcode"
	LoginRequirementPhoneCode LoginRequirement = "phone_code"
	LoginRequirementManual    LoginRequirement = "manual"
)

const (
	loginExploreURL = "https://www.xiaohongshu.com/explore"
	loginPageURL    = "https://www.xiaohongshu.com/notification"
)

var secondaryVerificationKeywords = []string{
	"手机验证码",
	"短信验证码",
	"手机号验证",
	"二次验证",
	"安全验证",
	"安全校验",
	"验证手机号",
}

func NewLogin(page *rod.Page) *LoginAction {
	return &LoginAction{page: page}
}

func (a *LoginAction) navigatePage(ctx context.Context, targetURL string) error {
	pp := a.page.Context(ctx)
	if err := pp.Navigate(targetURL); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errors.Wrapf(err, "navigate page failed: %s", targetURL)
	}
	if err := pp.WaitLoad(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errors.Wrapf(err, "wait page load failed: %s", targetURL)
	}
	return nil
}

func (a *LoginAction) navigateExplorePage(ctx context.Context) error {
	return a.navigatePage(ctx, loginExploreURL)
}

func (a *LoginAction) navigateLoginPage(ctx context.Context) error {
	return a.navigatePage(ctx, loginPageURL)
}

func (a *LoginAction) readQrcodeSnapshot(ctx context.Context) (string, bool, error) {
	pp := a.page.Context(ctx)
	result, err := pp.Eval(`() => {
		const loggedIn = !!document.querySelector('.main-container .user .link-wrapper .channel');
		const img = document.querySelector('.login-container .qrcode-img');
		const src = img instanceof HTMLImageElement ? (img.currentSrc || img.src || '') : '';
		return { loggedIn, src };
	}`)
	if err != nil {
		if ctx.Err() != nil {
			return "", false, ctx.Err()
		}
		return "", false, errors.Wrap(err, "read qrcode snapshot failed")
	}

	loggedIn := result.Value.Get("loggedIn").Bool()
	src := result.Value.Get("src").String()
	return src, loggedIn, nil
}

func (a *LoginAction) CheckLoginStatus(ctx context.Context) (bool, error) {
	logrus.Info("检查小红书登录状态")
	pp := a.page.Context(ctx)
	if err := a.navigateExplorePage(ctx); err != nil {
		return false, err
	}

	time.Sleep(1 * time.Second)

	exists, _, err := pp.Has(`.main-container .user .link-wrapper .channel`)
	if err != nil {
		return false, errors.Wrap(err, "check login status failed")
	}

	if !exists {
		return false, nil
	}

	return true, nil
}

func (a *LoginAction) CheckLoginStatusFast(ctx context.Context) (bool, error) {
	logrus.Info("快速检查小红书登录状态")
	pp := a.page.Context(ctx)
	if err := pp.Navigate(loginExploreURL); err != nil {
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		return false, errors.Wrap(err, "navigate explore page failed")
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		exists, _, err := pp.Has(`.main-container .user .link-wrapper .channel`)
		if err == nil && exists {
			return true, nil
		}

		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}

	return false, nil
}

func (a *LoginAction) Login(ctx context.Context) error {
	logrus.Info("开始执行小红书登录流程")
	pp := a.page.Context(ctx)

	if err := a.navigateExplorePage(ctx); err != nil {
		return err
	}
	time.Sleep(2 * time.Second)

	if exists, _, _ := pp.Has(".main-container .user .link-wrapper .channel"); exists {
		logrus.Info("检测到当前已登录，跳过登录流程")
		return nil
	}

	logrus.Info("等待登录完成")
	state, detail := a.WaitForLoginState(ctx)
	switch state {
	case LoginStateLoggedIn:
		logrus.Info("登录流程完成")
		return nil
	case LoginStateSecondaryRequired:
		logrus.Warnf("检测到手机端二次验证: %s", detail)
		return xhserrors.ErrSecondaryVerificationRequired
	default:
		logrus.Warnf("登录等待超时，页面摘要: %s", detail)
	}

	if ctx.Err() != nil {
		return ctx.Err()
	}

	return errors.New("login timeout")
}

func (a *LoginAction) FetchQrcodeImage(ctx context.Context) (string, bool, error) {
	logrus.Info("获取登录二维码")
	if err := a.navigateLoginPage(ctx); err != nil {
		return "", false, err
	}
	_ = a.page.Context(ctx).WaitIdle(3 * time.Second)

	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		src, loggedIn, err := a.readQrcodeSnapshot(ctx)
		if err != nil {
			return "", false, err
		}
		if loggedIn {
			return "", true, nil
		}
		if src != "" {
			logrus.Info("二维码获取成功")
			return src, false, nil
		}
		select {
		case <-ctx.Done():
			return "", false, ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
	}

	html, htmlErr := a.page.Context(ctx).HTML()
	if htmlErr == nil {
		if strings.Contains(html, "登录后查看更多") || strings.Contains(html, "扫码登录") {
			return "", false, errors.New("qrcode src is empty")
		}
	}

	return "", false, errors.New("qrcode load timeout")
}

func (a *LoginAction) PreparePhoneLoginPage(ctx context.Context) error {
	if err := a.PrepareLoginFlow(ctx); err != nil {
		return err
	}

	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		ready, err := a.hasPhoneLoginInputs(ctx)
		if err == nil && ready {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(800 * time.Millisecond):
		}
	}

	return errors.New("phone login page is not ready")
}

func (a *LoginAction) PrepareLoginFlow(ctx context.Context) error {
	if err := a.navigateLoginPage(ctx); err != nil {
		return err
	}
	_ = a.page.Context(ctx).WaitIdle(3 * time.Second)

	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		_ = a.clickText(ctx, "我知道了")
		_ = a.clickText(ctx, "同意并继续")

		flow, err := a.InspectLoginFlow(ctx)
		if err == nil && (flow.State == LoginStateLoggedIn ||
			flow.Requirement == LoginRequirementPhoneCode ||
			flow.Requirement == LoginRequirementQRCode) {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(800 * time.Millisecond):
		}
	}

	return errors.New("login flow is not ready")
}

func (a *LoginAction) FillPhoneNumber(ctx context.Context, phone string) error {
	pp := a.page.Context(ctx)
	element, err := pp.Element(`input[placeholder*="手机号"]`)
	if err != nil {
		return errors.Wrap(err, "find phone input failed")
	}
	if err := element.SelectAllText(); err != nil {
		logrus.Debugf("select phone input text failed: %v", err)
	}
	if err := element.Input(phone); err != nil {
		return errors.Wrap(err, "input phone number failed")
	}
	return nil
}

func (a *LoginAction) RequestPhoneCode(ctx context.Context) error {
	if err := a.clickText(ctx, "获取验证码"); err != nil {
		return errors.Wrap(err, "click send code button failed")
	}
	return nil
}

func (a *LoginAction) SubmitPhoneCode(ctx context.Context, code string) error {
	pp := a.page.Context(ctx)
	element, err := pp.Element(`input[placeholder*="验证码"]`)
	if err != nil {
		return errors.Wrap(err, "find code input failed")
	}
	if err := element.SelectAllText(); err != nil {
		logrus.Debugf("select code input text failed: %v", err)
	}
	if err := element.Input(code); err != nil {
		return errors.Wrap(err, "input verification code failed")
	}
	if err := a.clickText(ctx, "登录"); err != nil {
		return errors.Wrap(err, "click login button failed")
	}
	return nil
}

func (a *LoginAction) WaitForLogin(ctx context.Context) bool {
	pp := a.page.Context(ctx)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return false
		case <-ticker.C:
			el, err := pp.Element(".main-container .user .link-wrapper .channel")
			if err == nil && el != nil {
				return true
			}
		}
	}
}

func (a *LoginAction) hasPhoneLoginInputs(ctx context.Context) (bool, error) {
	result, err := a.page.Context(ctx).Eval(`() => ({
		hasPhoneInput: !!document.querySelector('input[placeholder*="手机号"]'),
		hasCodeInput: !!document.querySelector('input[placeholder*="验证码"]')
	})`)
	if err != nil {
		return false, err
	}

	return result.Value.Get("hasPhoneInput").Bool() &&
		result.Value.Get("hasCodeInput").Bool(), nil
}

func (a *LoginAction) clickText(ctx context.Context, targetText string) error {
	result, err := a.page.Context(ctx).Eval(`(text) => {
		const elements = Array.from(document.querySelectorAll('button, div, span, a'));
		const target = elements.find(el => (el.innerText || '').trim() === text);
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		target.click();
		return true;
	}`, targetText)
	if err != nil {
		return err
	}
	if !result.Value.Bool() {
		return errors.Errorf("text button not found: %s", targetText)
	}
	time.Sleep(1200 * time.Millisecond)
	return nil
}

func (a *LoginAction) WaitForLoginState(ctx context.Context) (LoginState, string) {
	pp := a.page.Context(ctx)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return LoginStateUnknown, ""
		case <-ticker.C:
			if err := a.navigateExplorePage(ctx); err != nil {
				logrus.Warnf("refresh explore page failed: %v", err)
				if ctx.Err() != nil {
					return LoginStateUnknown, ""
				}
				continue
			}

			if el, err := pp.Element(".main-container .user .link-wrapper .channel"); err == nil && el != nil {
				return LoginStateLoggedIn, ""
			}

			if blocked, detail := a.detectSecondaryVerification(ctx); blocked {
				return LoginStateSecondaryRequired, detail
			}
		}
	}
}

func (a *LoginAction) DetectLoginState(ctx context.Context) (LoginState, string) {
	pp := a.page.Context(ctx)
	if el, err := pp.Element(".main-container .user .link-wrapper .channel"); err == nil && el != nil {
		return LoginStateLoggedIn, ""
	}

	if blocked, detail := a.detectSecondaryVerification(ctx); blocked {
		return LoginStateSecondaryRequired, detail
	}

	// 二维码弹窗不存在或已隐藏，且认证 cookie 已存在时，视为登录完成。
	if has, err := a.hasAuthCookies(); err == nil && has {
		return LoginStateWaitingVerification, "auth cookies detected, waiting modal close"
	}

	return LoginStateWaitingVerification, ""
}

func containsLoginSuccessText(text string) bool {
	return strings.Contains(text, "\u767b\u5f55\u6210\u529f") ||
		strings.Contains(text, "\u626b\u7801\u6210\u529f") ||
		strings.Contains(text, "\u5373\u5c06\u8df3\u8f6c")
}

func (a *LoginAction) VerifySearchAccess(ctx context.Context, keyword string) (bool, string, error) {
	pp := a.page.Context(ctx)
	if err := pp.Navigate(makeSearchURL(keyword)); err != nil {
		if ctx.Err() != nil {
			return false, "", ctx.Err()
		}
		return false, "", errors.Wrap(err, "navigate search page failed")
	}
	if err := pp.WaitLoad(); err != nil {
		if ctx.Err() != nil {
			return false, "", ctx.Err()
		}
		return false, "", errors.Wrap(err, "wait search page load failed")
	}

	time.Sleep(3 * time.Second)
	text := a.collectLoginPageText(ctx)
	if containsLoginPrompt(text) {
		return false, snippet(text, "登录后查看搜索结果", 180), nil
	}

	return true, "", nil
}

func (a *LoginAction) EnsureSearchAccess(ctx context.Context, keyword string) (bool, string, error) {
	ready, detail, err := a.VerifySearchAccess(ctx, keyword)
	if err != nil {
		return false, detail, err
	}
	if ready {
		return true, "", nil
	}

	action := NewSearchAction(a.page)
	_, err = action.searchByInput(ctx, a.page.Context(ctx), keyword)
	switch err {
	case nil:
		return true, "", nil
	case xhserrors.ErrNoFeeds:
		return false, "search page loaded but no feeds captured", nil
	case xhserrors.ErrSearchLoginRequired:
		return false, detail, nil
	default:
		if err != nil {
			return false, detail, err
		}
		return false, detail, nil
	}
}

func (a *LoginAction) hasAuthCookies() (bool, error) {
	cks, err := a.page.Browser().GetCookies()
	if err != nil {
		return false, err
	}

	for _, ck := range cks {
		if ck == nil {
			continue
		}

		name := ck.Name
		if (name == "web_session" || name == "web_session_id") && ck.Value != "" {
			return true, nil
		}

		if (name == "a1" || name == "webId") && ck.Domain != "" && strings.Contains(ck.Domain, "xiaohongshu.com") {
			return true, nil
		}
	}

	return false, nil
}

func (a *LoginAction) detectSecondaryVerification(ctx context.Context) (bool, string) {
	text := a.collectLoginPageText(ctx)
	if text == "" {
		return false, ""
	}

	if marker := firstSecondaryVerificationKeyword(text); marker != "" {
		return true, snippet(text, marker, 180)
	}

	return false, snippet(text, "", 180)
}

func (a *LoginAction) collectLoginPageText(ctx context.Context) string {
	pp := a.page.Context(ctx)

	titleResult, err := pp.Eval(`() => document.title || ""`)
	if err != nil {
		logrus.Debugf("读取登录页标题失败: %v", err)
	}
	bodyResult, err := pp.Eval(`() => document.body ? document.body.innerText : ""`)
	if err != nil {
		logrus.Debugf("读取登录页正文失败: %v", err)
	}

	var builder strings.Builder
	if titleResult != nil {
		builder.WriteString(titleResult.Value.String())
		builder.WriteString("\n")
	}
	if bodyResult != nil {
		builder.WriteString(bodyResult.Value.String())
	}

	return strings.TrimSpace(builder.String())
}

func (a *LoginAction) CollectLoginDebugSummary(ctx context.Context) string {
	pp := a.page.Context(ctx)

	urlResult, err := pp.Eval(`() => location.href || ""`)
	if err != nil {
		logrus.Debugf("读取登录页地址失败: %v", err)
	}

	qrResult, err := pp.Eval(`() => {
		const qr = document.querySelector('.qrcode-img');
		if (!qr) {
			return 'missing';
		}
		const style = window.getComputedStyle(qr);
		return style.display === 'none' || style.visibility === 'hidden' ? 'hidden' : 'visible';
	}`)
	if err != nil {
		logrus.Debugf("读取二维码状态失败: %v", err)
	}

	text := snippet(a.collectLoginPageText(ctx), "", 240)

	var builder strings.Builder
	if urlResult != nil {
		builder.WriteString("url=")
		builder.WriteString(urlResult.Value.String())
	}
	if qrResult != nil {
		if builder.Len() > 0 {
			builder.WriteString(", ")
		}
		builder.WriteString("qr=")
		builder.WriteString(qrResult.Value.String())
	}
	if text != "" {
		if builder.Len() > 0 {
			builder.WriteString(", ")
		}
		builder.WriteString("text=")
		builder.WriteString(text)
	}

	return builder.String()
}

type loginPageSnapshot struct {
	URL             string
	Title           string
	BodyText        string
	QRState         string
	QRCodeImage     string
	LoggedIn        bool
	HasPhoneInput   bool
	HasCodeInput    bool
	SendCodeVisible bool
	LoginVisible    bool
}

func (a *LoginAction) readLoginPageSnapshot(ctx context.Context) (*loginPageSnapshot, error) {
	pp := a.page.Context(ctx)
	result, err := pp.Eval(`() => {
		const qr = document.querySelector('.qrcode-img');
		let qrState = 'missing';
		let qrCodeImage = '';
		if (qr) {
			const style = window.getComputedStyle(qr);
			qrState = style.display === 'none' || style.visibility === 'hidden' ? 'hidden' : 'visible';
			if (qr instanceof HTMLImageElement) {
				qrCodeImage = qr.currentSrc || qr.src || '';
			}
		}
		const phoneInput = document.querySelector('input[placeholder*="手机号"]');
		const codeInput = document.querySelector('input[placeholder*="验证码"]');
		const actions = Array.from(document.querySelectorAll('button, div, span, a')).map(el => (el.innerText || '').trim());
		return JSON.stringify({
			url: location.href || '',
			title: document.title || '',
			bodyText: document.body ? document.body.innerText.slice(0, 1200) : '',
			qrState,
			qrCodeImage,
			loggedIn: !!document.querySelector('.main-container .user .link-wrapper .channel'),
			hasPhoneInput: !!phoneInput,
			hasCodeInput: !!codeInput,
			sendCodeVisible: actions.includes('获取验证码'),
			loginVisible: actions.includes('登录'),
		});
	}`)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, errors.Wrap(err, "read login page snapshot failed")
	}

	payload := strings.TrimSpace(result.Value.String())
	if payload == "" {
		return &loginPageSnapshot{}, nil
	}

	var snapshot loginPageSnapshot
	if err := json.Unmarshal([]byte(payload), &snapshot); err != nil {
		return nil, errors.Wrap(err, "unmarshal login page snapshot failed")
	}

	return &snapshot, nil
}

func (a *LoginAction) InspectLoginFlow(ctx context.Context) (*LoginFlowState, error) {
	snapshot, err := a.readLoginPageSnapshot(ctx)
	if err != nil {
		return nil, err
	}

	hasAuth, err := a.hasAuthCookies()
	if err != nil {
		return nil, err
	}

	text := strings.TrimSpace(snapshot.Title + "\n" + snapshot.BodyText)
	flow := &LoginFlowState{
		State:              LoginStateWaitingVerification,
		Requirement:        LoginRequirementManual,
		Detail:             strings.TrimSpace(snippet(text, "", 180)),
		QRCodeImage:        snapshot.QRCodeImage,
		HasPhoneInput:      snapshot.HasPhoneInput,
		HasCodeInput:       snapshot.HasCodeInput,
		CanSendPhoneCode:   snapshot.HasPhoneInput && snapshot.SendCodeVisible,
		CanSubmitPhoneCode: snapshot.HasCodeInput && snapshot.LoginVisible,
	}

	if snapshot.LoggedIn {
		flow.State = LoginStateLoggedIn
		flow.Requirement = LoginRequirementNone
		flow.Detail = ""
		return flow, nil
	}

	if marker := firstSecondaryVerificationKeyword(text); marker != "" {
		flow.State = LoginStateSecondaryRequired
		flow.Detail = snippet(text, marker, 180)
		if snapshot.HasPhoneInput || snapshot.HasCodeInput {
			flow.Requirement = LoginRequirementPhoneCode
		} else if snapshot.QRState == "visible" && snapshot.QRCodeImage != "" {
			flow.Requirement = LoginRequirementQRCode
		}
		return flow, nil
	}

	if snapshot.HasPhoneInput || snapshot.HasCodeInput {
		flow.Requirement = LoginRequirementPhoneCode
		if flow.Detail == "" {
			flow.Detail = "phone verification required"
		}
		return flow, nil
	}

	if snapshot.QRState == "visible" && snapshot.QRCodeImage != "" {
		flow.Requirement = LoginRequirementQRCode
		if flow.Detail == "" {
			flow.Detail = "app scan required"
		}
		return flow, nil
	}

	if hasAuth && containsLoginSuccessText(text) {
		flow.Requirement = LoginRequirementManual
		flow.Detail = "auth cookies detected, waiting mobile confirmation"
		return flow, nil
	}

	if hasAuth && !containsLoginPrompt(text) {
		flow.Requirement = LoginRequirementManual
		flow.Detail = "auth cookies detected, waiting modal close"
	}

	return flow, nil
}

func (a *LoginAction) ConfirmLoggedIn(ctx context.Context) (bool, string, error) {
	hasAuth, err := a.hasAuthCookies()
	if err != nil {
		return false, "", err
	}
	if !hasAuth {
		return false, "", nil
	}

	snapshot, err := a.readLoginPageSnapshot(ctx)
	if err != nil {
		return false, "", err
	}

	if snapshot.LoggedIn {
		return true, "current page detected logged in", nil
	}

	text := strings.TrimSpace(snapshot.Title + "\n" + snapshot.BodyText)
	if marker := firstSecondaryVerificationKeyword(text); marker != "" {
		return false, snippet(text, marker, 180), nil
	}

	if containsLoginSuccessText(text) {
		return false, "auth cookies detected, waiting mobile confirmation", nil
	}

	return false, "auth cookies detected, waiting mobile confirmation", nil
}

func snippet(text, marker string, limit int) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return ""
	}

	runes := []rune(trimmed)
	if marker != "" {
		markerRunes := []rune(marker)
		for start := 0; start <= len(runes)-len(markerRunes); start++ {
			if string(runes[start:start+len(markerRunes)]) != marker {
				continue
			}
			begin := start - limit/2
			if begin < 0 {
				begin = 0
			}
			end := begin + limit
			if end > len(runes) {
				end = len(runes)
			}
			return strings.TrimSpace(string(runes[begin:end]))
		}
	}

	if len(runes) > limit {
		return strings.TrimSpace(string(runes[:limit]))
	}

	return trimmed
}

func firstSecondaryVerificationKeyword(text string) string {
	for _, keyword := range secondaryVerificationKeywords {
		if strings.Contains(text, keyword) {
			return keyword
		}
	}
	return ""
}
