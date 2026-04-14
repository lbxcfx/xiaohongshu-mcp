package cookies

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/pkg/errors"
)

type Cookier interface {
	LoadCookies() ([]byte, error)
	SaveCookies(data []byte) error
	DeleteCookies() error
}

type LoginState struct {
	Status    string    `json:"status"`
	Username  string    `json:"username,omitempty"`
	Detail    string    `json:"detail,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
}

type localCookie struct {
	path string
}

func NewLoadCookie(path string) Cookier {
	if path == "" {
		panic("path is required")
	}

	return &localCookie{
		path: path,
	}
}

// LoadCookies 从文件中加载 cookies。
func (c *localCookie) LoadCookies() ([]byte, error) {

	data, err := os.ReadFile(c.path)
	if err != nil {
		return nil, errors.Wrap(err, "failed to read cookies from tmp file")
	}

	return data, nil
}

// SaveCookies 保存 cookies 到文件中。
func (c *localCookie) SaveCookies(data []byte) error {
	if err := os.MkdirAll(filepath.Dir(c.path), 0755); err != nil {
		return err
	}
	return os.WriteFile(c.path, data, 0644)
}

// DeleteCookies 删除 cookies 文件。
func (c *localCookie) DeleteCookies() error {
	if _, err := os.Stat(c.path); os.IsNotExist(err) {
		// 文件不存在，返回 nil（认为已经删除）
		return nil
	}
	return os.Remove(c.path)
}

// GetCookiesFilePath 获取 cookies 文件路径。
// 为了向后兼容，如果旧路径 /tmp/cookies.json 存在，则继续使用；
// 否则使用当前目录下的 cookies.json
func GetCookiesFilePath() string {
	// 旧路径：/tmp/cookies.json
	tmpDir := os.TempDir()
	oldPath := filepath.Join(tmpDir, "cookies.json")

	// 检查旧路径文件是否存在
	if _, err := os.Stat(oldPath); err == nil {
		// 文件存在，使用旧路径（向后兼容）
		return oldPath
	}

	path := os.Getenv("COOKIES_PATH") // 判断环境变量
	if path == "" {
		path = "cookies.json" // fallback，本地调试时用当前目录
	}

	// 文件不存在，使用新路径（当前目录）
	return path
}

// GetLoginStateFilePath 获取登录状态文件路径。
func GetLoginStateFilePath() string {
	tmpDir := os.TempDir()
	oldPath := filepath.Join(tmpDir, "login_state.json")
	if _, err := os.Stat(oldPath); err == nil {
		return oldPath
	}

	path := os.Getenv("LOGIN_STATE_PATH")
	if path == "" {
		path = "login_state.json"
	}
	return path
}

// SaveLoginState 保存登录状态。
func SaveLoginState(state LoginState) error {
	return SaveLoginStateTo(GetLoginStateFilePath(), state)
}

func SaveLoginStateTo(path string, state LoginState) error {
	state.UpdatedAt = time.Now()
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// LoadLoginState 读取登录状态。
func LoadLoginState() (*LoginState, error) {
	return LoadLoginStateFrom(GetLoginStateFilePath())
}

func LoadLoginStateFrom(path string) (*LoginState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, errors.Wrap(err, "failed to read login state file")
	}

	var state LoginState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

// DeleteLoginState 删除登录状态文件。
func DeleteLoginState() error {
	return DeleteLoginStateFrom(GetLoginStateFilePath())
}

func DeleteLoginStateFrom(path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}
	return os.Remove(path)
}
