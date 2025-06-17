# MACI Bridge Flutter 示例

这是一个使用 WebView 集成 MACI Bridge 的 Flutter 示例应用。

## 功能特性

- 🚀 **MACI 客户端初始化** - 连接到测试网或主网
- 🔑 **密钥管理** - 生成和管理 MACI 密钥对
- 📊 **客户端信息** - 查看网络状态和密钥信息
- 🎯 **轮次管理** - 获取轮次信息和列表
- 🗳️ **投票功能** - 注册投票和余额查询
- 📝 **实时日志** - Flutter 和 JavaScript 之间的双向通信
- 🔄 **状态管理** - 实时状态更新和错误处理

## 运行步骤

### 1. 构建 MACI Bridge

首先确保在父目录中构建了 MACI Bridge：

```bash
cd ..
npm run build
```

### 2. 安装 Flutter 依赖

```bash
flutter pub get
```

### 3. 运行应用

```bash
# 在 iOS 模拟器运行
flutter run

# 在 Android 模拟器运行
flutter run

# 在 Chrome 运行（用于调试）
flutter run -d chrome
```

## 使用说明

### 基本操作流程

1. **启动应用** - 应用会自动加载 MACI Bridge
2. **初始化 MACI** - 点击 "初始化MACI" 按钮连接到网络
3. **获取信息** - 使用各种按钮获取客户端和轮次信息
4. **查看日志** - 在日志区域查看详细的操作日志
5. **WebView 调试** - 点击右下角的网页图标查看 WebView 内容

### 界面说明

- **状态卡片** - 显示当前 MACI 客户端状态
- **控制面板** - 提供各种操作按钮
- **日志区域** - 显示操作历史和错误信息
- **WebView 弹窗** - 点击 FAB 按钮可查看原始 WebView

### 主要按钮功能

- **初始化MACI** - 连接 MACI 网络并初始化客户端
- **客户端信息** - 获取公钥、私钥等信息
- **生成密钥** - 生成新的 MACI 密钥对
- **获取轮次** - 查询可用的投票轮次
- **检查余额** - 查看投票权限余额
- **清除日志** - 清空日志记录

## 技术架构

### Flutter 层
- 使用 `webview_flutter` 包加载 HTML 页面
- 通过 `JavaScriptChannel` 实现双向通信
- 状态管理使用 Flutter 内置的 `setState`

### WebView 层
- 加载 `maci-bridge.js` JavaScript 库
- 提供丰富的 UI 界面用于测试
- 通过 `flutter_inappwebview` 向 Flutter 发送消息

### 通信机制
```
Flutter ←→ WebView ←→ MACI Bridge ←→ 区块链网络
```

## 目录结构

```
flutter_maci_example/
├── lib/
│   └── main.dart           # Flutter 主应用代码
├── assets/
│   ├── maci-bridge.js      # MACI Bridge JavaScript 库
│   └── maci_bridge.html    # WebView HTML 页面
├── pubspec.yaml            # Flutter 依赖配置
└── README.md               # 本文档
```

## 故障排除

### 常见问题

1. **WebView 无法加载**
   - 确保 `assets/maci-bridge.js` 文件存在
   - 检查 `pubspec.yaml` 中的 assets 配置

2. **JavaScript 错误**
   - 查看 Flutter 控制台的 debugPrint 输出
   - 检查日志区域的错误信息

3. **网络连接问题**
   - 确保设备有网络连接
   - 检查防火墙和代理设置

### 调试技巧

1. **启用 Chrome 调试**：
   ```bash
   flutter run -d chrome --web-renderer html
   ```

2. **查看 WebView 控制台**：
   - 点击 FAB 按钮查看 WebView 内容
   - 在浏览器中直接打开 `maci_bridge.html`

3. **检查网络请求**：
   - 使用浏览器开发者工具
   - 监控网络请求和响应

## 扩展开发

### 添加新功能

1. **在 HTML 中添加新的 JavaScript 函数**
2. **在 Flutter 中添加对应的调用按钮**
3. **通过 `JavaScriptChannel` 处理返回数据**

### 自定义样式

- 修改 `maci_bridge.html` 中的 CSS 样式
- 调整 Flutter 界面布局和颜色

### 集成到现有应用

- 将 `WebViewController` 集成到您的应用中
- 复制 JavaScript 通信逻辑
- 根据需要调整 UI 组件

## 许可证

MIT License - 详见项目根目录的 LICENSE 文件
