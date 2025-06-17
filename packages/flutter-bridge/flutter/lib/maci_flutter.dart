import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// MACI SDK的Flutter封装
class MaciFlutter {
  static MaciFlutter? _instance;
  InAppWebViewController? _webViewController;
  bool _isInitialized = false;
  final Map<String, Completer<dynamic>> _pendingRequests = {};
  int _requestCounter = 0;

  /// 单例模式
  static MaciFlutter get instance {
    _instance ??= MaciFlutter._internal();
    return _instance!;
  }

  MaciFlutter._internal();

  /// 初始化WebView
  Future<void> initializeWebView(InAppWebViewController controller) async {
    _webViewController = controller;
    
    // 添加JavaScript处理器
    await _webViewController!.addJavaScriptHandler(
      handlerName: 'onBridgeReady',
      callback: _handleBridgeReady,
    );
    
    await _webViewController!.addJavaScriptHandler(
      handlerName: 'onMaciResponse',
      callback: _handleMaciResponse,
    );
    
    await _webViewController!.addJavaScriptHandler(
      handlerName: 'onMaciEvent',
      callback: _handleMaciEvent,
    );
  }

  /// 获取WebView HTML内容
  String getWebViewHtml() {
    // 这里应该返回包含maci-bridge.js的HTML内容
    // 实际实现中，你需要将构建好的文件包含在Flutter assets中
    return '''
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MACI SDK Bridge</title>
</head>
<body>
    <div id="status">正在加载MACI SDK...</div>
    <!-- 这里需要包含构建好的maci-bridge.js -->
    <script>
      // 临时占位符 - 实际使用时需要包含真实的maci-bridge.js内容
      window.MaciBridge = {
        initialize: async (config) => ({ success: true }),
        signup: async (params) => ({ success: true, stateIndex: params.stateIndex }),
        publishMessage: async (params) => ({ success: true, messageHash: '0x...' }),
        generateProof: async (params) => ({ success: true, proof: {} }),
        getState: async (stateIndex) => ({ success: true, state: {} })
      };
      
      document.getElementById('status').textContent = 'MACI SDK已加载';
      
      if (window.flutter_inappwebview) {
        window.flutter_inappwebview.callHandler('onBridgeReady', {
          success: true,
          timestamp: Date.now()
        });
      }
    </script>
</body>
</html>
    ''';
  }

  /// 处理桥接准备就绪事件
  void _handleBridgeReady(List<dynamic> args) {
    if (args.isNotEmpty) {
      final data = args[0] as Map<String, dynamic>;
      _isInitialized = data['success'] == true;
      debugPrint('MACI Bridge Ready: \$_isInitialized');
    }
  }

  /// 处理MACI响应
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

  /// 处理MACI事件
  void _handleMaciEvent(List<dynamic> args) {
    if (args.isNotEmpty) {
      final event = args[0] as Map<String, dynamic>;
      debugPrint('MACI Event: \${event['event']}, Data: \${event['data']}');
      
      // 这里可以添加事件监听器模式
      // _eventController.add(MaciEvent.fromJson(event));
    }
  }

  /// 调用MACI方法
  Future<T> _callMaciMethod<T>(String method, Map<String, dynamic> params) async {
    if (!_isInitialized || _webViewController == null) {
      throw Exception('MACI SDK未初始化');
    }

    final requestId = 'req_\${_requestCounter++}';
    final completer = Completer<T>();
    _pendingRequests[requestId] = completer;

    // 设置超时
    Timer(const Duration(seconds: 30), () {
      if (_pendingRequests.containsKey(requestId)) {
        _pendingRequests.remove(requestId);
        completer.completeError(TimeoutException('请求超时', const Duration(seconds: 30)));
      }
    });

    // 发送消息到WebView
    await _webViewController!.evaluateJavascript(source: '''
      if (window.MaciBridge && window.MaciBridge.\$method) {
        window.MaciBridge.\$method(\${jsonEncode(params)}).then(function(result) {
          window.flutter_inappwebview.callHandler('onMaciResponse', {
            type: 'response',
            data: {
              requestId: '\$requestId',
              success: true,
              data: result
            }
          });
        }).catch(function(error) {
          window.flutter_inappwebview.callHandler('onMaciResponse', {
            type: 'response',
            data: {
              requestId: '\$requestId',
              success: false,
              error: error.message
            }
          });
        });
      } else {
        window.flutter_inappwebview.callHandler('onMaciResponse', {
          type: 'response',
          data: {
            requestId: '\$requestId',
            success: false,
            error: '方法不存在: \$method'
          }
        });
      }
    ''');

    return completer.future;
  }

  /// 初始化MACI客户端
  Future<void> initialize(Map<String, dynamic> config) async {
    await _callMaciMethod('initialize', config);
  }

  /// 用户注册
  Future<MaciSignupResult> signup({
    required String pubKey,
    required int stateIndex,
    required int voiceCreditBalance,
  }) async {
    final result = await _callMaciMethod<Map<String, dynamic>>('signup', {
      'pubKey': pubKey,
      'stateIndex': stateIndex,
      'voiceCreditBalance': voiceCreditBalance,
    });
    
    return MaciSignupResult.fromJson(result);
  }

  /// 发布消息
  Future<MaciMessageResult> publishMessage({
    required Map<String, dynamic> message,
    required String encPubKey,
  }) async {
    final result = await _callMaciMethod<Map<String, dynamic>>('publishMessage', {
      'message': message,
      'encPubKey': encPubKey,
    });
    
    return MaciMessageResult.fromJson(result);
  }

  /// 生成证明
  Future<MaciProofResult> generateProof({
    required Map<String, dynamic> inputs,
  }) async {
    final result = await _callMaciMethod<Map<String, dynamic>>('generateProof', {
      'inputs': inputs,
    });
    
    return MaciProofResult.fromJson(result);
  }

  /// 获取状态
  Future<MaciStateResult> getState(String stateIndex) async {
    final result = await _callMaciMethod<Map<String, dynamic>>('getState', {
      'stateIndex': stateIndex,
    });
    
    return MaciStateResult.fromJson(result);
  }

  /// 检查是否已初始化
  bool get isInitialized => _isInitialized;
}

/// 注册结果
class MaciSignupResult {
  final bool success;
  final String? transactionHash;
  final int? stateIndex;
  final String? error;

  MaciSignupResult({
    required this.success,
    this.transactionHash,
    this.stateIndex,
    this.error,
  });

  factory MaciSignupResult.fromJson(Map<String, dynamic> json) {
    return MaciSignupResult(
      success: json['success'] ?? false,
      transactionHash: json['transactionHash'],
      stateIndex: json['stateIndex'],
      error: json['error'],
    );
  }
}

/// 消息发布结果
class MaciMessageResult {
  final bool success;
  final String? messageHash;
  final int? timestamp;
  final String? error;

  MaciMessageResult({
    required this.success,
    this.messageHash,
    this.timestamp,
    this.error,
  });

  factory MaciMessageResult.fromJson(Map<String, dynamic> json) {
    return MaciMessageResult(
      success: json['success'] ?? false,
      messageHash: json['messageHash'],
      timestamp: json['timestamp'],
      error: json['error'],
    );
  }
}

/// 证明生成结果
class MaciProofResult {
  final bool success;
  final Map<String, dynamic>? proof;
  final String? error;

  MaciProofResult({
    required this.success,
    this.proof,
    this.error,
  });

  factory MaciProofResult.fromJson(Map<String, dynamic> json) {
    return MaciProofResult(
      success: json['success'] ?? false,
      proof: json['proof'],
      error: json['error'],
    );
  }
}

/// 状态查询结果
class MaciStateResult {
  final bool success;
  final Map<String, dynamic>? state;
  final String? error;

  MaciStateResult({
    required this.success,
    this.state,
    this.error,
  });

  factory MaciStateResult.fromJson(Map<String, dynamic> json) {
    return MaciStateResult(
      success: json['success'] ?? false,
      state: json['state'],
      error: json['error'],
    );
  }
} 