package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// setupRoutes 设置路由配置
func setupRoutes(appServer *AppServer) *gin.Engine {
	// 设置 Gin 模式
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	// 添加中间件
	router.Use(errorHandlingMiddleware())
	router.Use(corsMiddleware())

	// 健康检查
	router.GET("/health", healthHandler)

	// MCP 端点 - 使用官方 SDK 的 Streamable HTTP Handler
	mcpHandler := mcp.NewStreamableHTTPHandler(
		func(r *http.Request) *mcp.Server {
			return appServer.mcpServer
		},
		&mcp.StreamableHTTPOptions{
			JSONResponse: true, // 支持 JSON 响应
		},
	)
	router.Any("/mcp", gin.WrapH(mcpHandler))
	router.Any("/mcp/*path", gin.WrapH(mcpHandler))

	// API 路由组
	api := router.Group("/api/v1")
	registerAccountScopedRoutes(api, appServer)

	defaultAccount := api.Group("", accountContextMiddleware("default"))
	{
		registerXhsRoutes(defaultAccount, appServer)
	}

	return router
}

func accountContextMiddleware(defaultAccountID string) gin.HandlerFunc {
	return func(c *gin.Context) {
		accountID := c.Param("accountId")
		if accountID == "" {
			accountID = c.GetHeader("X-XHS-Account-ID")
		}
		if accountID == "" {
			accountID = defaultAccountID
		}

		accountID = normalizeAccountID(accountID)
		c.Set("account", accountID)
		ctx := withAccountRuntime(c.Request.Context(), accountID)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

func registerAccountScopedRoutes(api *gin.RouterGroup, appServer *AppServer) {
	accounts := api.Group("/accounts/:accountId", accountContextMiddleware(""))
	registerXhsRoutes(accounts, appServer)
}

func registerXhsRoutes(api *gin.RouterGroup, appServer *AppServer) {
	api.GET("/login/status", appServer.checkLoginStatusHandler)
	api.POST("/login/session/start", appServer.startLoginSessionHandler)
	api.GET("/login/qrcode", appServer.getLoginQrcodeHandler)
	api.POST("/login/phone/start", appServer.startPhoneLoginHandler)
	api.POST("/login/phone/send_code", appServer.sendPhoneLoginCodeHandler)
	api.POST("/login/phone/verify", appServer.verifyPhoneLoginCodeHandler)
	api.GET("/login/search_access", appServer.checkSearchAccessHandler)
	api.DELETE("/login/cookies", appServer.deleteCookiesHandler)
	api.POST("/publish", appServer.publishHandler)
	api.POST("/publish_video", appServer.publishVideoHandler)
	api.GET("/feeds/list", appServer.listFeedsHandler)
	api.GET("/feeds/search", appServer.searchFeedsHandler)
	api.POST("/feeds/search", appServer.searchFeedsHandler)
	api.POST("/feeds/detail", appServer.getFeedDetailHandler)
	api.POST("/user/profile", appServer.userProfileHandler)
	api.POST("/feeds/comment", appServer.postCommentHandler)
	api.POST("/feeds/comment/reply", appServer.replyCommentHandler)
	api.GET("/user/me", appServer.myProfileHandler)
}
