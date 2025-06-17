# MACI SDK Flutter集成指南

本指南提供了将MACI SDK集成到Flutter项目的完整解决方案。

## 方案概述

我们提供了三种主要的集成方案：

### 方案一：WebView + JavaScript Bridge (推荐)
- **优点**: 实现最快，无需重写业务逻辑，完全兼容现有的maci-sdk
- **缺点**: 需要WebView组件，包体积稍大
- **适用场景**: 大部分Flutter应用

### 方案二：Flutter Web + JavaScript互操作
- **优点**: 原生JavaScript调用，性能最佳
- **缺点**: 仅支持Flutter Web平台
- **适用场景**: 纯Web应用

### 方案三：Platform Channels + 原生插件
- **优点**: 性能好，可以访问原生功能
- **缺点**: 开发复杂度高，需要维护多平台代码
- **适用场景**: 需要原生功能的复杂应用

## 方案一实现步骤

### 1. 构建JavaScript桥接文件

首先构建maci-sdk的JavaScript桥接包：

\`\`\`bash
cd packages/flutter-bridge
pnpm install
pnpm run build
\`\`\`

这会生成 `dist/maci-bridge.js` 文件。

### 2. 在Flutter项目中添加依赖

在你的Flutter项目的 `pubspec.yaml` 中添加：

\`\`\`yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_inappwebview: ^5.8.0

  # 其他依赖...

flutter:
  assets:
    - assets/maci/
\`\`\`

### 3. 复制资源文件

将以下文件复制到Flutter项目的 `assets/maci/` 目录：
- `dist/maci-bridge.js`
- `assets/maci-webview.html`

### 4. Flutter代码实现

创建MACI SDK的Flutter封装：

\`\`\`dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class MaciFlutter {
  static MaciFlutter? _instance;
  InAppWebViewController? _webViewController;
  bool _isInitialized = false;
  final Map<String, Completer<dynamic>> _pendingRequests = {};
  int _requestCounter = 0;

  static MaciFlutter get instance {
    _instance ??= MaciFlutter._internal();
    return _instance!;
  }

  MaciFlutter._internal();

  Future<void> initializeWebView(InAppWebViewController controller) async {
    _webViewController = controller;
    
    await _webViewController!.addJavaScriptHandler(
      handlerName: 'onBridgeReady',
      callback: _handleBridgeReady,
    );
    
    await _webViewController!.addJavaScriptHandler(
      handlerName: 'onMaciResponse',
      callback: _handleMaciResponse,
    );
  }

  void _handleBridgeReady(List<dynamic> args) {
    if (args.isNotEmpty) {
      final data = args[0] as Map<String, dynamic>;
      _isInitialized = data['success'] == true;
      debugPrint('MACI Bridge Ready: $_isInitialized');
    }
  }

  void _handleMaciResponse(List<dynamic> args) {
    if (args.isNotEmpty) {
      final response = args[0] as Map<String, dynamic>;
      final data = response['data'] as Map<String, dynamic>;
      final requestId = data['requestId'] as String?;
      
      if (requestId != null && _pendingRequests.containsKey(requestId)) {
        final completer = _pendingRequests.remove(requestId)!;
        
        if (data['success'] == true) {
          completer.complete(data['data']);
        } else {
          completer.completeError(Exception(data['error'] ?? '未知错误'));
        }
      }
    }
  }

  Future<T> _callMaciMethod<T>(String method, Map<String, dynamic> params) async {
    if (!_isInitialized || _webViewController == null) {
      throw Exception('MACI SDK未初始化');
    }

    final requestId = 'req_\${_requestCounter++}';
    final completer = Completer<T>();
    _pendingRequests[requestId] = completer;

    await _webViewController!.evaluateJavascript(source: '''
      window.MaciBridge.$method(${jsonEncode(params)}).then(function(result) {
        window.flutter_inappwebview.callHandler('onMaciResponse', {
          type: 'response',
          data: {
            requestId: '$requestId',
            success: true,
            data: result
          }
        });
      }).catch(function(error) {
        window.flutter_inappwebview.callHandler('onMaciResponse', {
          type: 'response',
          data: {
            requestId: '$requestId',
            success: false,
            error: error.message
          }
        });
      });
    ''');

    return completer.future;
  }

  // 公共API方法
  Future<void> initialize(Map<String, dynamic> config) async {
    await _callMaciMethod('initialize', config);
  }

  Future<Map<String, dynamic>> signup({
    required String pubKey,
    required int stateIndex,
    required int voiceCreditBalance,
  }) async {
    return await _callMaciMethod('signup', {
      'pubKey': pubKey,
      'stateIndex': stateIndex,
      'voiceCreditBalance': voiceCreditBalance,
    });
  }

  bool get isInitialized => _isInitialized;
}
\`\`\`

### 5. 在应用中使用

\`\`\`dart
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class MaciWebViewScreen extends StatefulWidget {
  @override
  _MaciWebViewScreenState createState() => _MaciWebViewScreenState();
}

class _MaciWebViewScreenState extends State<MaciWebViewScreen> {
  InAppWebViewController? webViewController;
  String webViewHtml = '';

  @override
  void initState() {
    super.initState();
    _loadWebViewHtml();
  }

  Future<void> _loadWebViewHtml() async {
    final html = await rootBundle.loadString('assets/maci/maci-webview.html');
    setState(() {
      webViewHtml = html;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('MACI SDK')),
      body: webViewHtml.isEmpty 
        ? Center(child: CircularProgressIndicator())
        : InAppWebView(
            initialData: InAppWebViewInitialData(data: webViewHtml),
            onWebViewCreated: (InAppWebViewController controller) async {
              webViewController = controller;
              await MaciFlutter.instance.initializeWebView(controller);
            },
            onLoadStop: (controller, url) async {
              // WebView加载完成后初始化MACI
              await _initializeMaci();
            },
          ),
      floatingActionButton: FloatingActionButton(
        onPressed: _testMaciFunction,
        child: Icon(Icons.play_arrow),
      ),
    );
  }

  Future<void> _initializeMaci() async {
    try {
      await MaciFlutter.instance.initialize({
        'rpcUrl': 'YOUR_RPC_URL',
        'contractAddress': 'YOUR_CONTRACT_ADDRESS',
        // 其他配置...
      });
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('MACI SDK初始化成功')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('初始化失败: $e')),
      );
    }
  }

  Future<void> _testMaciFunction() async {
    try {
      final result = await MaciFlutter.instance.signup(
        pubKey: 'YOUR_PUBLIC_KEY',
        stateIndex: 1,
        voiceCreditBalance: 100,
      );
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('注册成功: $result')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('操作失败: $e')),
      );
    }
  }
}
\`\`\`

## 方案二：Flutter Web实现

如果你的Flutter应用只需要支持Web平台，可以使用更简单的JavaScript互操作：

\`\`\`dart
import 'dart:html' as html;
import 'dart:js' as js;

class MaciWebSdk {
  static bool _isInitialized = false;

  static Future<void> initialize() async {
    // 动态加载MACI SDK脚本
    final script = html.ScriptElement();
    script.src = 'assets/maci/maci-bridge.js';
    html.document.head!.append(script);
    
    // 等待脚本加载
    await script.onLoad.first;
    _isInitialized = true;
  }

  static Future<Map<String, dynamic>> signup({
    required String pubKey,
    required int stateIndex,
    required int voiceCreditBalance,
  }) async {
    if (!_isInitialized) throw Exception('SDK未初始化');
    
    final result = await js.context.callMethod('MaciBridge.signup', [
      js.JsObject.jsify({
        'pubKey': pubKey,
        'stateIndex': stateIndex,
        'voiceCreditBalance': voiceCreditBalance,
      })
    ]);
    
    return Map<String, dynamic>.from(result);
  }
}
\`\`\`

## 构建和部署

### 构建JavaScript桥接文件

\`\`\`bash
cd packages/flutter-bridge
pnpm run build
\`\`\`

### 更新maci-sdk依赖

当maci-sdk更新时，重新构建桥接文件：

\`\`\`bash
pnpm install
pnpm run build
\`\`\`

### 添加到Flutter assets

确保将构建好的文件添加到Flutter项目的assets中，并在pubspec.yaml中声明。

## 注意事项

1. **安全性**: WebView中的JavaScript代码具有访问设备的能力，确保只加载可信的代码
2. **性能**: WebView会增加内存使用，注意内存管理
3. **调试**: 可以通过Chrome DevTools调试WebView中的JavaScript代码
4. **更新**: 当maci-sdk更新时，需要重新构建桥接文件
5. **平台支持**: WebView方案支持iOS和Android，Web方案仅支持Flutter Web

## 故障排除

### 常见问题

1. **桥接未初始化**: 确保WebView完全加载后再调用MACI方法
2. **JavaScript错误**: 检查浏览器控制台的错误信息
3. **资源加载失败**: 确保assets文件路径正确
4. **方法调用超时**: 检查网络连接和RPC配置

### 调试技巧

1. 启用WebView调试模式
2. 使用Chrome DevTools检查JavaScript执行
3. 添加更多日志输出
4. 检查Flutter和JavaScript之间的消息传递

## 示例项目

参考 `examples/flutter_maci_demo` 目录中的完整示例项目。

## 下一步

1. 根据你的具体需求选择合适的集成方案
2. 将构建好的桥接文件集成到你的Flutter项目
3. 根据maci-sdk的实际API调整方法调用
4. 添加错误处理和用户反馈机制
5. 进行充分的测试，特别是在不同设备和网络条件下 