package main

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
)

type accountContextKey struct{}

type AccountRuntime struct {
	ID                 string
	BaseDir            string
	CookiesPath        string
	LoginStatePath     string
	BrowserUserDataDir string
}

var accountLocks = struct {
	mu    sync.Mutex
	locks map[string]*sync.Mutex
}{
	locks: map[string]*sync.Mutex{},
}

func normalizeAccountID(accountID string) string {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return "default"
	}

	accountID = strings.ReplaceAll(accountID, "\\", "_")
	accountID = strings.ReplaceAll(accountID, "/", "_")
	accountID = strings.ReplaceAll(accountID, "..", "_")
	return accountID
}

func newAccountRuntime(accountID string) AccountRuntime {
	id := normalizeAccountID(accountID)
	baseDir := filepath.Join(".data", "xhs-accounts", id)
	return AccountRuntime{
		ID:                 id,
		BaseDir:            baseDir,
		CookiesPath:        filepath.Join(baseDir, "cookies.json"),
		LoginStatePath:     filepath.Join(baseDir, "login_state.json"),
		BrowserUserDataDir: filepath.Join(baseDir, "browser"),
	}
}

func withAccountRuntime(ctx context.Context, accountID string) context.Context {
	runtime := newAccountRuntime(accountID)
	return context.WithValue(ctx, accountContextKey{}, runtime)
}

func getAccountRuntime(ctx context.Context) AccountRuntime {
	if runtime, ok := ctx.Value(accountContextKey{}).(AccountRuntime); ok {
		return runtime
	}
	return newAccountRuntime("default")
}

func lockAccount(accountID string) func() {
	id := normalizeAccountID(accountID)
	accountLocks.mu.Lock()
	lock := accountLocks.locks[id]
	if lock == nil {
		lock = &sync.Mutex{}
		accountLocks.locks[id] = lock
	}
	accountLocks.mu.Unlock()

	lock.Lock()
	return lock.Unlock
}
