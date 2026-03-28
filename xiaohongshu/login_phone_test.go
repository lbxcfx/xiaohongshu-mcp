package xiaohongshu

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-rod/rod"
	"github.com/stretchr/testify/require"
	"github.com/xpzouying/xiaohongshu-mcp/browser"
)

func TestPhoneLoginPageAvailable(t *testing.T) {
	page, cleanup := newFreshLoginTestPage(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()

	login := NewLogin(page)
	err := login.navigateLoginPage(ctx)
	require.NoError(t, err)
	require.NoError(t, login.PrepareLoginFlow(ctx))

	flow, err := login.InspectLoginFlow(ctx)
	require.NoError(t, err)
	require.Contains(t,
		[]LoginRequirement{LoginRequirementPhoneCode, LoginRequirementQRCode},
		flow.Requirement,
		"未检测到可用的登录方式")
}

func TestPhoneLoginAndSearch(t *testing.T) {
	phone := strings.TrimSpace(os.Getenv("XHS_TEST_PHONE"))
	code := strings.TrimSpace(os.Getenv("XHS_TEST_CODE"))
	if phone == "" || code == "" {
		t.Skip("SKIP: 需要设置 XHS_TEST_PHONE 和 XHS_TEST_CODE 才能执行手机号登录实验")
	}

	page, cleanup := newFreshLoginTestPage(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	login := NewLogin(page)
	err := login.navigateLoginPage(ctx)
	require.NoError(t, err)

	require.NoError(t, preparePhoneLoginPage(page.Context(ctx)))
	require.NoError(t, fillInputByPlaceholder(page.Context(ctx), "手机号", phone))
	require.NoError(t, clickByText(page.Context(ctx), []string{"获取验证码"}))
	require.NoError(t, fillInputByPlaceholder(page.Context(ctx), "验证码", code))
	require.NoError(t, clickByText(page.Context(ctx), []string{"登录"}))

	require.Eventually(t, func() bool {
		ok, err := login.CheckLoginStatusFast(context.Background())
		return err == nil && ok
	}, 45*time.Second, time.Second, "手机号登录后未进入登录态")

	search := NewSearchAction(page)
	feeds, err := search.Search(ctx, "Kimi")
	require.NoError(t, err)
	require.NotEmpty(t, feeds, "登录后搜索结果为空")
}

type phoneLoginSnapshot struct {
	hasPhoneInput     bool
	hasCodeInput      bool
	hasSendCodeButton bool
	hasLoginButton    bool
}

func newFreshLoginTestPage(t *testing.T) (*rod.Page, func()) {
	t.Helper()

	profileDir := t.TempDir()
	cookiesPath := filepath.Join(t.TempDir(), "cookies.json")

	prevCookiePath, hasCookiePath := os.LookupEnv("COOKIES_PATH")
	prevProfilePath, hasProfilePath := os.LookupEnv("XHS_BROWSER_USER_DATA_DIR")

	require.NoError(t, os.Setenv("COOKIES_PATH", cookiesPath))
	require.NoError(t, os.Setenv("XHS_BROWSER_USER_DATA_DIR", profileDir))

	binPath := os.Getenv("XHS_BROWSER_BIN")
	b := browser.NewBrowser(false, browser.WithBinPath(binPath))
	page := b.NewPage()

	cleanup := func() {
		_ = page.Close()
		b.Close()

		if hasCookiePath {
			_ = os.Setenv("COOKIES_PATH", prevCookiePath)
		} else {
			_ = os.Unsetenv("COOKIES_PATH")
		}

		if hasProfilePath {
			_ = os.Setenv("XHS_BROWSER_USER_DATA_DIR", prevProfilePath)
		} else {
			_ = os.Unsetenv("XHS_BROWSER_USER_DATA_DIR")
		}
	}

	return page, cleanup
}

func readPhoneLoginSnapshot(page *rod.Page) (*phoneLoginSnapshot, error) {
	result, err := page.Eval(`() => ({
		hasPhoneInput: !!document.querySelector('input[placeholder*="手机号"]'),
		hasCodeInput: !!document.querySelector('input[placeholder*="验证码"]'),
		hasSendCodeButton: Array.from(document.querySelectorAll('button, div, span'))
			.some(el => (el.innerText || '').trim() === '获取验证码'),
		hasLoginButton: Array.from(document.querySelectorAll('button, div, span'))
			.some(el => (el.innerText || '').trim() === '登录')
	})`)
	if err != nil {
		return nil, err
	}

	snapshot := &phoneLoginSnapshot{}
	snapshot.hasPhoneInput = result.Value.Get("hasPhoneInput").Bool()
	snapshot.hasCodeInput = result.Value.Get("hasCodeInput").Bool()
	snapshot.hasSendCodeButton = result.Value.Get("hasSendCodeButton").Bool()
	snapshot.hasLoginButton = result.Value.Get("hasLoginButton").Bool()
	return snapshot, nil
}

func acceptLoginAgreement(page *rod.Page) error {
	return clickByText(page, []string{"同意并继续"})
}

func preparePhoneLoginPage(page *rod.Page) error {
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		_ = clickByText(page, []string{"我知道了"})
		_ = acceptLoginAgreement(page)

		snapshot, err := readPhoneLoginSnapshot(page)
		if err == nil && snapshot.hasPhoneInput && snapshot.hasCodeInput {
			return nil
		}
		time.Sleep(800 * time.Millisecond)
	}
	return fmt.Errorf("手机号登录控件未就绪")
}

func fillInputByPlaceholder(page *rod.Page, placeholderPart, value string) error {
	element, err := page.Element(`input[placeholder*="` + placeholderPart + `"]`)
	if err != nil {
		return err
	}
	if err := element.SelectAllText(); err != nil {
		// 忽略旧内容为空时的选中失败。
	}
	return element.Input(value)
}

func clickByText(page *rod.Page, candidates []string) error {
	for _, text := range candidates {
		result, err := page.Eval(`(targetText) => {
			const elements = Array.from(document.querySelectorAll('button, div, span, a'));
			const target = elements.find(el => (el.innerText || '').trim() === targetText);
			if (!(target instanceof HTMLElement)) {
				return false;
			}
			target.click();
			return true;
		}`, text)
		if err == nil && result.Value.Bool() {
			time.Sleep(1200 * time.Millisecond)
			return nil
		}
	}
	return fmt.Errorf("未找到可点击元素: %s", strings.Join(candidates, ","))
}
