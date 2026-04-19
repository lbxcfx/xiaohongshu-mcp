package xiaohongshu

import (
	"context"
	"fmt"
	"time"

	"github.com/go-rod/rod"
)

type NavigateAction struct {
	page *rod.Page
}

func NewNavigate(page *rod.Page) *NavigateAction {
	return &NavigateAction{page: page}
}

func (n *NavigateAction) ToExplorePage(ctx context.Context) error {
	page := n.page.Context(ctx)

	if err := page.Navigate("https://www.xiaohongshu.com/explore"); err != nil {
		return err
	}
	if err := page.WaitLoad(); err != nil {
		return err
	}
	if _, err := page.Timeout(10 * time.Second).Element(`div#app`); err != nil {
		return err
	}

	return nil
}

func (n *NavigateAction) ToProfilePage(ctx context.Context) error {
	page := n.page.Context(ctx)

	if err := n.ToExplorePage(ctx); err != nil {
		return err
	}

	if err := page.WaitStable(1200 * time.Millisecond); err != nil && ctx.Err() != nil {
		return ctx.Err()
	}

	if profileURL, err := n.readCurrentProfileURL(ctx); err == nil && profileURL != "" {
		if err := page.Navigate(profileURL); err != nil {
			return err
		}
		if err := page.WaitLoad(); err != nil && ctx.Err() != nil {
			return ctx.Err()
		}
		return nil
	}

	selectors := []string{
		`div.main-container li.user.side-bar-component a.link-wrapper span.channel`,
		`li.user.side-bar-component a.link-wrapper`,
		`a[href*="/user/profile"]`,
	}
	var profileLink *rod.Element
	for _, selector := range selectors {
		el, err := page.Timeout(2 * time.Second).Element(selector)
		if err == nil && el != nil {
			profileLink = el
			break
		}
	}
	if profileLink == nil {
		return fmt.Errorf("profile sidebar link not found")
	}
	if err := profileLink.Click("left", 1); err != nil {
		return err
	}

	if err := page.WaitLoad(); err != nil && ctx.Err() != nil {
		return ctx.Err()
	}

	return nil
}

func (n *NavigateAction) readCurrentProfileURL(ctx context.Context) (string, error) {
	result, err := n.page.Context(ctx).Eval(`() => {
		const unwrap = (value) => {
			if (!value || typeof value !== 'object') return value;
			if (value.value !== undefined) return value.value;
			if (value._value !== undefined) return value._value;
			return value;
		};
		const state = window.__INITIAL_STATE__;
		const user = state && state.user;
		const userInfo = unwrap(user && user.userInfo) || {};
		const userPageData = unwrap(user && user.userPageData) || {};
		const basicInfo = userPageData.basicInfo || userPageData.userBasicInfo || {};
		const userId = userInfo.userId || userInfo.user_id || basicInfo.userId || basicInfo.user_id || '';
		return userId ? ` + "`" + `https://www.xiaohongshu.com/user/profile/${userId}` + "`" + ` : '';
	}`)
	if err != nil {
		return "", err
	}
	return result.Value.String(), nil
}
