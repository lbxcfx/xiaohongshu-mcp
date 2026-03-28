package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/xpzouying/xiaohongshu-mcp/browser"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
)

func main() {
	var (
		binPath string
		phone   string
		code    string
		keyword string
	)
	flag.StringVar(&binPath, "bin", "", "浏览器二进制路径")
	flag.StringVar(&phone, "phone", "", "手机号，可选")
	flag.StringVar(&code, "code", "", "验证码，可选")
	flag.StringVar(&keyword, "keyword", "Kimi", "登录成功后验证搜索的关键字")
	flag.Parse()

	profileDir, err := os.MkdirTemp("", "xhs-phone-login-*")
	if err != nil {
		logrus.Fatalf("create temp profile failed: %v", err)
	}
	defer os.RemoveAll(profileDir)

	cookiesPath := filepath.Join(profileDir, "cookies.json")
	_ = os.Setenv("COOKIES_PATH", cookiesPath)

	b := browser.NewBrowser(false, browser.WithBinPath(binPath), browser.WithUserDataDir(profileDir))
	defer b.Close()

	page := b.NewPage()
	defer page.Close()

	action := xiaohongshu.NewLogin(page)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	if err := action.PreparePhoneLoginPage(ctx); err != nil {
		logrus.Fatalf("prepare phone login page failed: %v", err)
	}
	logrus.Info("官方登录页已打开，可以走手机号验证码登录")

	if phone != "" {
		if err := action.FillPhoneNumber(ctx, phone); err != nil {
			logrus.Fatalf("fill phone failed: %v", err)
		}
		if err := action.RequestPhoneCode(ctx); err != nil {
			logrus.Fatalf("request code failed: %v", err)
		}
		logrus.Info("已点击获取验证码，请查收短信")
	}

	if code != "" {
		if err := action.SubmitPhoneCode(ctx, code); err != nil {
			logrus.Fatalf("submit code failed: %v", err)
		}
		logrus.Info("已提交验证码，等待登录完成")
	} else {
		logrus.Info("请在浏览器窗口中手动输入验证码并点击登录")
	}

	waitCtx, waitCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer waitCancel()
	if !action.WaitForLogin(waitCtx) {
		logrus.Fatal("login was not completed in time")
	}

	search := xiaohongshu.NewSearchAction(page)
	feeds, err := search.Search(ctx, keyword)
	if err != nil {
		logrus.Fatalf("search failed after login: %v", err)
	}

	firstTitle := ""
	if len(feeds) > 0 {
		firstTitle = feeds[0].NoteCard.DisplayTitle
	}
	fmt.Printf("login ok, search keyword=%q count=%d first_title=%q\n", keyword, len(feeds), firstTitle)
}
