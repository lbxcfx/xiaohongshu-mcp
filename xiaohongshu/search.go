package xiaohongshu

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/input"
	"github.com/xpzouying/xiaohongshu-mcp/errors"
)

type SearchResult struct {
	Search struct {
		Feeds FeedsValue `json:"feeds"`
	} `json:"search"`
}

// FilterOption 表示搜索筛选条件。
type FilterOption struct {
	SortBy      string `json:"sort_by,omitempty" jsonschema:"排序依据: 综合|最新|最多点赞|最多评论|最多收藏,默认为'综合'"`
	NoteType    string `json:"note_type,omitempty" jsonschema:"笔记类型: 不限|视频|图文,默认为'不限'"`
	PublishTime string `json:"publish_time,omitempty" jsonschema:"发布时间: 不限|一天内|一周内|半年内,默认为'不限'"`
	SearchScope string `json:"search_scope,omitempty" jsonschema:"搜索范围: 不限|已看过|未看过|已关注,默认为'不限'"`
	Location    string `json:"location,omitempty" jsonschema:"位置距离: 不限|同城|附近,默认为'不限'"`
}

// internalFilterOption 表示页面筛选索引。
type internalFilterOption struct {
	FiltersIndex int
	TagsIndex    int
	Text         string
}

// filterOptionsMap 定义筛选项到页面索引的映射。
var filterOptionsMap = map[int][]internalFilterOption{
	1: {
		{FiltersIndex: 1, TagsIndex: 1, Text: "综合"},
		{FiltersIndex: 1, TagsIndex: 2, Text: "最新"},
		{FiltersIndex: 1, TagsIndex: 3, Text: "最多点赞"},
		{FiltersIndex: 1, TagsIndex: 4, Text: "最多评论"},
		{FiltersIndex: 1, TagsIndex: 5, Text: "最多收藏"},
	},
	2: {
		{FiltersIndex: 2, TagsIndex: 1, Text: "不限"},
		{FiltersIndex: 2, TagsIndex: 2, Text: "视频"},
		{FiltersIndex: 2, TagsIndex: 3, Text: "图文"},
	},
	3: {
		{FiltersIndex: 3, TagsIndex: 1, Text: "不限"},
		{FiltersIndex: 3, TagsIndex: 2, Text: "一天内"},
		{FiltersIndex: 3, TagsIndex: 3, Text: "一周内"},
		{FiltersIndex: 3, TagsIndex: 4, Text: "半年内"},
	},
	4: {
		{FiltersIndex: 4, TagsIndex: 1, Text: "不限"},
		{FiltersIndex: 4, TagsIndex: 2, Text: "已看过"},
		{FiltersIndex: 4, TagsIndex: 3, Text: "未看过"},
		{FiltersIndex: 4, TagsIndex: 4, Text: "已关注"},
	},
	5: {
		{FiltersIndex: 5, TagsIndex: 1, Text: "不限"},
		{FiltersIndex: 5, TagsIndex: 2, Text: "同城"},
		{FiltersIndex: 5, TagsIndex: 3, Text: "附近"},
	},
}

// convertToInternalFilters 将接口筛选转换为页面筛选索引。
func convertToInternalFilters(filter FilterOption) ([]internalFilterOption, error) {
	var internalFilters []internalFilterOption

	addFilter := func(groupIndex int, text string, label string) error {
		if text == "" {
			return nil
		}
		internal, err := findInternalOption(groupIndex, text)
		if err != nil {
			return fmt.Errorf("%s错误: %w", label, err)
		}
		if internal.TagsIndex == 1 {
			return nil
		}
		internalFilters = append(internalFilters, internal)
		return nil
	}

	if err := addFilter(1, filter.SortBy, "排序依据"); err != nil {
		return nil, err
	}
	if err := addFilter(2, filter.NoteType, "笔记类型"); err != nil {
		return nil, err
	}
	if err := addFilter(3, filter.PublishTime, "发布时间"); err != nil {
		return nil, err
	}
	if err := addFilter(4, filter.SearchScope, "搜索范围"); err != nil {
		return nil, err
	}
	if err := addFilter(5, filter.Location, "位置距离"); err != nil {
		return nil, err
	}

	return internalFilters, nil
}

// findInternalOption 根据分组和文本查找筛选索引。
func findInternalOption(filtersIndex int, text string) (internalFilterOption, error) {
	options, exists := filterOptionsMap[filtersIndex]
	if !exists {
		return internalFilterOption{}, fmt.Errorf("筛选组 %d 不存在", filtersIndex)
	}

	for _, option := range options {
		if option.Text == text {
			return option, nil
		}
	}

	return internalFilterOption{}, fmt.Errorf("在筛选组 %d 中未找到文本 '%s'", filtersIndex, text)
}

// validateInternalFilterOption 校验筛选索引是否有效。
func validateInternalFilterOption(filter internalFilterOption) error {
	if filter.FiltersIndex < 1 || filter.FiltersIndex > 5 {
		return fmt.Errorf("无效的筛选组索引 %d，有效范围为 1-5", filter.FiltersIndex)
	}

	options, exists := filterOptionsMap[filter.FiltersIndex]
	if !exists {
		return fmt.Errorf("筛选组 %d 不存在", filter.FiltersIndex)
	}

	if filter.TagsIndex < 1 || filter.TagsIndex > len(options) {
		return fmt.Errorf(
			"筛选组 %d 的标签索引 %d 超出范围，有效范围为 1-%d",
			filter.FiltersIndex,
			filter.TagsIndex,
			len(options),
		)
	}

	return nil
}

type SearchAction struct {
	page *rod.Page
}

const extractSearchFeedsScript = `() => {
	const state = window.__INITIAL_STATE__;
	const seen = new Set();
	const unwrap = value => {
		if (!value || typeof value !== "object") return value;
		if (value.value !== undefined) return value.value;
		if (value._value !== undefined) return value._value;
		if (value._rawValue !== undefined) return value._rawValue;
		return value;
	};
	const looksLikeFeedList = value => Array.isArray(value) && value.some(item => {
		if (!item || typeof item !== "object") return false;
		return item.noteCard || item.note_card || (item.id && (item.xsecToken || item.xsec_token));
	});
	const findFeeds = (node, depth = 0) => {
		if (!node || depth > 8) return null;
		const value = unwrap(node);
		if (looksLikeFeedList(value)) return value;
		if (!value || typeof value !== "object") return null;
		if (seen.has(value)) return null;
		seen.add(value);
		const entries = Object.entries(value);
		entries.sort((a, b) => {
			const af = /feed|search|note/i.test(a[0]) ? 0 : 1;
			const bf = /feed|search|note/i.test(b[0]) ? 0 : 1;
			return af - bf;
		});
		for (const [, child] of entries) {
			const found = findFeeds(child, depth + 1);
			if (found) return found;
		}
		return null;
	};
	const textOf = (root, selectors) => {
		for (const selector of selectors) {
			const el = root.querySelector(selector);
			const text = (el && (el.innerText || el.textContent || el.getAttribute("title") || "")).trim();
			if (text) return text;
		}
		return "";
	};
	const imageOf = root => {
		const img = root.querySelector("img");
		return img ? (img.currentSrc || img.src || "") : "";
	};
	const domFeeds = () => {
		if (!String(location.href || "").includes("/search_result")) return [];
		const roots = Array.from(document.querySelectorAll("section.note-item, div.note-item, .feeds-container section, .search-layout section"));
		const feeds = [];
		const seenIds = new Set();
		for (const root of roots) {
			const link = root.querySelector('a[href*="/explore/"]');
			if (!link || !link.href) continue;
			let parsed;
			try {
				parsed = new URL(link.href, location.href);
			} catch (e) {
				continue;
			}
			const match = parsed.pathname.match(/\/explore\/([^/]+)/);
			const id = match ? match[1] : "";
			if (!id || seenIds.has(id)) continue;
			seenIds.add(id);
			const title = textOf(root, [
				".title",
				"[class*='title']",
				"a[title]",
				"span"
			]);
			const authorLink = root.querySelector('a[href*="/user/profile"]');
			const author = textOf(root, [
				".author .name",
				"[class*='author'] [class*='name']",
				"[class*='user'] [class*='name']",
				"a[href*='/user/profile']"
			]);
			const userMatch = authorLink && authorLink.href ? authorLink.href.match(/\/user\/profile\/([^/?#]+)/) : null;
			const isVideo = Boolean(root.querySelector("video, [class*='video'], [class*='play']"));
			const image = imageOf(root);
			feeds.push({
				xsecToken: parsed.searchParams.get("xsec_token") || "",
				id,
				modelType: "note",
				index: feeds.length,
				noteCard: {
					type: isVideo ? "video" : "normal",
					displayTitle: title,
					user: {
						userId: userMatch ? userMatch[1] : "",
						nickname: author,
						nickName: author,
						avatar: ""
					},
					interactInfo: {
						likedCount: textOf(root, [".like-wrapper", "[class*='like']", "[class*='count']"]),
						commentCount: "",
						sharedCount: "",
						collectedCount: ""
					},
					cover: {
						url: image,
						urlDefault: image,
						urlPre: image
					},
					video: isVideo ? { capa: { duration: 0 } } : null
				}
			});
		}
		return feeds;
	};
	const search = unwrap(state && state.search);
	const directCandidates = [
		search && search.feeds,
		search && search.items,
		search && search.notes,
		search && search.result && search.result.feeds,
		search && search.result && search.result.items,
	];
	for (const candidate of directCandidates) {
		const value = unwrap(candidate);
		if (looksLikeFeedList(value)) {
			return JSON.stringify(value);
		}
	}
	const feeds = findFeeds(search);
	if (feeds) return JSON.stringify(feeds);
	const fallbackFeeds = domFeeds();
	return fallbackFeeds.length > 0 ? JSON.stringify(fallbackFeeds) : "";
}`

func NewSearchAction(page *rod.Page) *SearchAction {
	pp := page.Timeout(60 * time.Second)

	return &SearchAction{page: pp}
}

func (s *SearchAction) Search(ctx context.Context, keyword string, filters ...FilterOption) ([]Feed, error) {
	page := s.page.Context(ctx)
	return s.searchWithoutMust(ctx, page, keyword, filters...)
}

// searchByInput 供登录态探测兜底使用。
func (s *SearchAction) searchByInput(ctx context.Context, page *rod.Page, keyword string) ([]Feed, error) {
	if err := page.Navigate(loginExploreURL); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("navigate explore page failed: %w", err)
	}
	if err := page.WaitLoad(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("wait explore page load failed: %w", err)
	}

	searchInput, err := findSearchInput(page, 6*time.Second)
	if err != nil {
		return nil, err
	}

	if err := searchInput.SelectAllText(); err != nil {
	}
	if err := searchInput.Input(keyword); err != nil {
		return nil, fmt.Errorf("input search keyword failed: %w", err)
	}
	if err := page.Keyboard.Press(input.Enter); err != nil {
		return nil, fmt.Errorf("submit search keyword failed: %w", err)
	}

	_ = waitForSearchFeeds(ctx, page, 10*time.Second)

	result, err := evalSearchFeeds(page)
	if err != nil {
		return nil, err
	}

	if result == "" {
		if pageShowsSearchLoginPrompt(page) {
			return nil, errors.ErrSearchLoginRequired
		}
		return nil, errors.ErrNoFeeds
	}

	var feeds []Feed
	if err := json.Unmarshal([]byte(result), &feeds); err != nil {
		return nil, fmt.Errorf("failed to unmarshal feeds: %w", err)
	}

	if len(feeds) == 0 && pageShowsSearchLoginPrompt(page) {
		return nil, errors.ErrSearchLoginRequired
	}

	return feeds, nil
}

func (s *SearchAction) searchWithoutMust(ctx context.Context, page *rod.Page, keyword string, filters ...FilterOption) ([]Feed, error) {
	searchURL := makeSearchURL(keyword)
	if err := page.Navigate(searchURL); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("navigate search page failed: %w", err)
	}
	if err := page.WaitLoad(); err != nil && ctx.Err() != nil {
		return nil, ctx.Err()
	}

	_ = waitForSearchFeeds(ctx, page, 15*time.Second)
	return s.readSearchFeeds(ctx, page, keyword, filters...)
}

func (s *SearchAction) readSearchFeeds(ctx context.Context, page *rod.Page, keyword string, filters ...FilterOption) ([]Feed, error) {
	result, err := evalSearchFeeds(page)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, err
	}

	if result == "" {
		if pageShowsSearchLoginPrompt(page) {
			return nil, errors.ErrSearchLoginRequired
		}
		fallbackFeeds, err := s.searchByInput(ctx, page, keyword)
		if err == nil {
			return applySearchFilters(fallbackFeeds, filters...), nil
		}
		if err == errors.ErrSearchLoginRequired {
			return nil, err
		}
		return []Feed{}, nil
	}

	var feeds []Feed
	if err := json.Unmarshal([]byte(result), &feeds); err != nil {
		return nil, fmt.Errorf("failed to unmarshal feeds: %w", err)
	}

	if len(feeds) == 0 {
		if pageShowsSearchLoginPrompt(page) {
			return nil, errors.ErrSearchLoginRequired
		}
		fallbackFeeds, err := s.searchByInput(ctx, page, keyword)
		if err == nil && len(fallbackFeeds) > 0 {
			return applySearchFilters(fallbackFeeds, filters...), nil
		}
		if err == errors.ErrSearchLoginRequired {
			return nil, err
		}
	}

	return applySearchFilters(feeds, filters...), nil
}

func applySearchFilters(feeds []Feed, filters ...FilterOption) []Feed {
	if len(feeds) == 0 || len(filters) == 0 {
		return feeds
	}

	result := append([]Feed(nil), feeds...)
	for _, filter := range filters {
		result = filterByNoteType(result, filter.NoteType)
		sortFeeds(result, filter.SortBy)
	}

	return result
}

func filterByNoteType(feeds []Feed, noteType string) []Feed {
	switch strings.TrimSpace(noteType) {
	case "", "不限":
		return feeds
	case "视频":
		filtered := make([]Feed, 0, len(feeds))
		for _, feed := range feeds {
			if feed.NoteCard.Video != nil || feed.NoteCard.Type == "video" {
				filtered = append(filtered, feed)
			}
		}
		return filtered
	case "图文":
		filtered := make([]Feed, 0, len(feeds))
		for _, feed := range feeds {
			if feed.NoteCard.Video == nil && feed.NoteCard.Type != "video" {
				filtered = append(filtered, feed)
			}
		}
		return filtered
	default:
		return feeds
	}
}

func sortFeeds(feeds []Feed, sortBy string) {
	switch strings.TrimSpace(sortBy) {
	case "最多点赞":
		sort.SliceStable(feeds, func(i, j int) bool {
			return parseInteractionCount(feeds[i].NoteCard.InteractInfo.LikedCount) >
				parseInteractionCount(feeds[j].NoteCard.InteractInfo.LikedCount)
		})
	case "最多评论":
		sort.SliceStable(feeds, func(i, j int) bool {
			return parseInteractionCount(feeds[i].NoteCard.InteractInfo.CommentCount) >
				parseInteractionCount(feeds[j].NoteCard.InteractInfo.CommentCount)
		})
	case "最多收藏":
		sort.SliceStable(feeds, func(i, j int) bool {
			return parseInteractionCount(feeds[i].NoteCard.InteractInfo.CollectedCount) >
				parseInteractionCount(feeds[j].NoteCard.InteractInfo.CollectedCount)
		})
	}
}

func parseInteractionCount(value string) int {
	text := strings.TrimSpace(strings.ReplaceAll(value, ",", ""))
	if text == "" {
		return 0
	}
	multiplier := 1.0
	if strings.Contains(text, "万") {
		multiplier = 10000
		text = strings.ReplaceAll(text, "万", "")
	}
	if strings.Contains(strings.ToLower(text), "w") {
		multiplier = 10000
		text = strings.ReplaceAll(strings.ToLower(text), "w", "")
	}
	count, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0
	}
	return int(count * multiplier)
}

func waitForSearchFeeds(ctx context.Context, page *rod.Page, timeout time.Duration) error {
	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	return page.Context(waitCtx).Wait(rod.Eval(`() => {
		try {
			if (document.querySelector(".login-modal, .login-container")) return true;
			const state = window.__INITIAL_STATE__;
			if (state) {
				const unwrap = value => {
					if (!value || typeof value !== "object") return value;
					return value.value ?? value._value ?? value._rawValue ?? value;
				};
				const search = unwrap(state.search);
				const feeds = unwrap(search && search.feeds);
				if (Array.isArray(feeds) && feeds.length > 0) return true;
			}
			if (document.querySelector(".search-layout a[href*='/explore/'], .feeds-container a[href*='/explore/'], section.note-item a[href*='/explore/'], div.note-item a[href*='/explore/']")) return true;
			const text = document.body ? document.body.innerText.slice(0, 1600) : "";
			return text.includes("\u767b\u5f55\u540e\u67e5\u770b\u641c\u7d22\u7ed3\u679c") ||
				text.includes("\u6682\u65e0\u76f8\u5173\u7b14\u8bb0") ||
				text.includes("\u6ca1\u6709\u627e\u5230");
		} catch(e) {
			return false;
		}
	}`))
}

func evalSearchFeeds(page *rod.Page) (string, error) {
	result, err := page.Eval(extractSearchFeedsScript)
	if err != nil {
		return "", fmt.Errorf("extract search feeds failed: %w", err)
	}
	return result.Value.String(), nil
}

func makeSearchURL(keyword string) string {
	values := url.Values{}
	values.Set("keyword", keyword)
	values.Set("source", "web_explore_feed")

	return fmt.Sprintf("https://www.xiaohongshu.com/search_result?%s", values.Encode())
}

func findSearchInput(page *rod.Page, timeout time.Duration) (*rod.Element, error) {
	selectors := []string{
		`input[placeholder*="搜索"]`,
		`.search-input input`,
		`.search-input`,
		`input[placeholder*="小红书"]`,
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, selector := range selectors {
			element, err := page.Timeout(300 * time.Millisecond).Element(selector)
			if err == nil && element != nil {
				return element, nil
			}
		}
		time.Sleep(200 * time.Millisecond)
	}

	return nil, fmt.Errorf("search input not found")
}

func containsLoginPrompt(text string) bool {
	return strings.Contains(text, "登录后查看搜索结果")
}

func pageShowsSearchLoginPrompt(page *rod.Page) bool {
	result, err := page.Eval(`() => {
		if (document.querySelector(".login-modal, .login-container")) return true;
		const text = document.body ? document.body.innerText.slice(0, 1600) : "";
		return text.includes("\u767b\u5f55\u540e\u67e5\u770b\u641c\u7d22\u7ed3\u679c") ||
			(text.includes("\u626b\u7801") && text.includes("\u624b\u673a\u53f7\u767b\u5f55"));
	}`)
	if err != nil {
		return false
	}
	return result.Value.Bool()
}
