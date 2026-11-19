package com.ewaste.ewaste_opportunity

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var adminFiles: AdminFiles? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        adminFiles = AdminFiles(this, flutterEngine.dartExecutor.binaryMessenger)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ewaste/app_info")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getVersion" -> result.success(packageManager.getPackageInfo(packageName, 0).versionName)
                    else -> result.notImplemented()
                }
            }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        adminFiles?.onActivityResult(requestCode, resultCode, data)
    }
}
