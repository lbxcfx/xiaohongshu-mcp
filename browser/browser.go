package browser

import (
	"encoding/json"
	"io"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
	"github.com/go-rod/stealth"
	"github.com/sirupsen/logrus"
	"github.com/xpzouying/xiaohongshu-mcp/cookies"
)

type Browser struct {
	browser  *rod.Browser
	launcher *launcher.Launcher
	config   browserConfig
}

type browserConfig struct {
	binPath     string
	userDataDir string
}

type Option func(*browserConfig)

func WithBinPath(binPath string) Option {
	return func(c *browserConfig) {
		c.binPath = binPath
	}
}

func WithUserDataDir(userDataDir string) Option {
	return func(c *browserConfig) {
		c.userDataDir = userDataDir
	}
}

// maskProxyCredentials masks username and password in proxy URL for safe logging.
func maskProxyCredentials(proxyURL string) string {
	u, err := url.Parse(proxyURL)
	if err != nil || u.User == nil {
		return proxyURL
	}
	if _, hasPassword := u.User.Password(); hasPassword {
		u.User = url.UserPassword("***", "***")
	} else {
		u.User = url.User("***")
	}
	return u.String()
}

func NewBrowser(headless bool, options ...Option) *Browser {
	cfg := &browserConfig{}
	for _, opt := range options {
		opt(cfg)
	}

	l := launcher.New().
		Headless(headless).
		Leakless(false).
		Logger(io.MultiWriter(os.Stdout, os.Stderr)).
		UserDataDir(getConfiguredUserDataDir(cfg)).
		Set("no-sandbox").
		Set("disable-breakpad").
		Set("disable-gpu").
		Set("disable-dev-shm-usage").
		Set("disable-software-rasterizer")

	if cfg.binPath != "" {
		l = l.Bin(cfg.binPath)
	}

	if proxy := os.Getenv("XHS_PROXY"); proxy != "" {
		l = l.Proxy(proxy)
		logrus.Infof("Using proxy: %s", maskProxyCredentials(proxy))
	}

	browserURL := l.MustLaunch()
	b := rod.New().
		ControlURL(browserURL).
		MustConnect()

	cookiePath := cookies.GetCookiesFilePath()
	cookieLoader := cookies.NewLoadCookie(cookiePath)
	if data, err := cookieLoader.LoadCookies(); err == nil {
		var cookieList []*proto.NetworkCookie
		if err := json.Unmarshal(data, &cookieList); err == nil {
			b.MustSetCookies(cookieList...)
			logrus.Debugf("loaded cookies from file successfully")
		} else {
			logrus.Warnf("failed to unmarshal cookies: %v", err)
		}
	} else {
		logrus.Warnf("failed to load cookies: %v", err)
	}

	return &Browser{
		browser:  b,
		launcher: l,
		config:   *cfg,
	}
}

func getConfiguredUserDataDir(cfg *browserConfig) string {
	if cfg.userDataDir != "" {
		return cfg.userDataDir
	}
	return GetUserDataDir()
}

func (b *Browser) Close() {
	b.browser.MustClose()
	b.launcher.Kill()
	if isEphemeralUserDataDir(getConfiguredUserDataDir(&b.config)) {
		b.launcher.Cleanup()
	}
}

func (b *Browser) NewPage() *rod.Page {
	return stealth.MustPage(b.browser)
}

func GetUserDataDir() string {
	if dir := os.Getenv("XHS_BROWSER_USER_DATA_DIR"); dir != "" {
		return dir
	}

	return filepath.Join(os.TempDir(), "xhs-browser-profile")
}

func isEphemeralUserDataDir(userDataDir string) bool {
	if userDataDir == "" {
		return false
	}

	cleanDir := filepath.Clean(userDataDir)
	return strings.HasPrefix(filepath.Base(cleanDir), "xhs-browser-task-") &&
		filepath.Dir(cleanDir) == filepath.Clean(os.TempDir())
}

func CloneUserDataDirToTemp() (string, error) {
	sourceDir := GetUserDataDir()
	targetDir, err := os.MkdirTemp("", "xhs-browser-task-*")
	if err != nil {
		return "", err
	}

	if _, err := os.Stat(sourceDir); err != nil {
		if os.IsNotExist(err) {
			return targetDir, nil
		}
		return "", err
	}

	if err := filepath.WalkDir(sourceDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return nil
			}
			return walkErr
		}

		relPath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}
		if relPath == "." {
			return nil
		}

		targetPath := filepath.Join(targetDir, relPath)
		info, err := d.Info()
		if err != nil {
			return err
		}

		if d.IsDir() {
			return os.MkdirAll(targetPath, info.Mode())
		}

		if shouldSkipProfileEntry(relPath, d) {
			return nil
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		return os.WriteFile(targetPath, data, info.Mode())
	}); err != nil {
		return "", err
	}

	return targetDir, nil
}

func shouldSkipProfileEntry(relPath string, d fs.DirEntry) bool {
	name := d.Name()
	if strings.HasPrefix(name, "Singleton") || name == "DevToolsActivePort" || name == "lockfile" {
		return true
	}

	if d.Type()&os.ModeSymlink != 0 {
		return true
	}

	return strings.Contains(relPath, "Crash Reports")
}

func ClearUserDataDir() error {
	userDataDir := GetUserDataDir()
	if err := os.RemoveAll(userDataDir); err == nil {
		return nil
	}

	if runtime.GOOS == "linux" {
		cmd := exec.Command("rm", "-rf", userDataDir)
		if output, err := cmd.CombinedOutput(); err != nil {
			logrus.Warnf("force remove browser profile failed: %v, output: %s", err, strings.TrimSpace(string(output)))
			return err
		}
		return nil
	}

	return os.RemoveAll(userDataDir)
}

// CleanupStaleBrowserProfile 清理残留的浏览器 profile 进程和目录。
func CleanupStaleBrowserProfile() error {
	userDataDir := GetUserDataDir()
	logrus.Infof("cleanup stale browser profile: %s", userDataDir)

	if runtime.GOOS == "linux" {
		cmd := exec.Command("pkill", "-f", "--", "--user-data-dir="+userDataDir)
		if output, err := cmd.CombinedOutput(); err != nil {
			// pkill 未匹配到进程时会返回 1，这里不视为错误。
			if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() != 1 {
				logrus.Warnf("failed to kill stale browser profile process: %v, output: %s", err, strings.TrimSpace(string(output)))
			}
		}
	}

	if err := ClearUserDataDir(); err != nil {
		logrus.Errorf("clear browser profile failed: %v", err)
		return err
	}

	return nil
}
