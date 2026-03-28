package errors

import "errors"

var ErrNoFeeds = errors.New("没有捕获到 feeds 数据")
var ErrNoFeedDetail = errors.New("没有捕获到 feed 详情数据")
var ErrSecondaryVerificationRequired = errors.New("需要手机号二次验证")
var ErrSearchLoginRequired = errors.New("搜索页需要重新登录")
