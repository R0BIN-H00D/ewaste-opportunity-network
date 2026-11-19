package com.ewaste.ewaste_opportunity

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.roundToInt

internal class AdminFiles(private val activity: Activity, messenger: BinaryMessenger) {
    private data class Save(val bytes: ByteArray, val result: MethodChannel.Result)
    private var pendingSave: Save? = null

    init {
        MethodChannel(messenger, "ewaste/admin_files").setMethodCallHandler { call, result ->
            val bytes = call.argument<ByteArray>("bytes")
            when {
                bytes == null || bytes.isEmpty() -> result.error("EMPTY_FILE", "The file is empty.", null)
                call.method == "saveCsv" -> saveCsv(bytes, call.argument<String>("name") ?: "export.csv", result)
                call.method == "renderPdf" -> renderPdf(bytes, call.argument<Int>("page") ?: 0, result)
                else -> result.notImplemented()
            }
        }
    }

    private fun saveCsv(bytes: ByteArray, name: String, result: MethodChannel.Result) {
        if (pendingSave != null) {
            result.error("BUSY", "Finish saving the first file.", null)
            return
        }
        pendingSave = Save(bytes, result)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "text/csv"
            putExtra(Intent.EXTRA_TITLE, name.substringAfterLast('/').substringAfterLast('\\'))
        }
        try {
            activity.startActivityForResult(intent, SAVE_REQUEST)
        } catch (error: Exception) {
            pendingSave = null
            result.error("SAVE_FAILED", "No file picker is available.", null)
        }
    }

    fun onActivityResult(request: Int, status: Int, data: Intent?) {
        if (request != SAVE_REQUEST) return
        val save = pendingSave ?: return
        pendingSave = null
        val uri = data?.data
        if (status != Activity.RESULT_OK || uri == null) {
            save.result.success(false)
            return
        }
        thread {
            try {
                activity.contentResolver.openOutputStream(uri)?.use { it.write(save.bytes) }
                    ?: error("No output stream")
                activity.runOnUiThread { save.result.success(true) }
            } catch (error: Exception) {
                activity.runOnUiThread { save.result.error("SAVE_FAILED", "The file could not be saved.", null) }
            }
        }
    }

    private fun renderPdf(bytes: ByteArray, pageIndex: Int, result: MethodChannel.Result) {
        thread {
            var file: File? = null
            try {
                file = File.createTempFile("admin-pdf-", ".pdf", activity.cacheDir)
                file.writeBytes(bytes)
                val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = try { PdfRenderer(descriptor) } catch (error: Exception) {
                    descriptor.close()
                    throw error
                }
                renderer.use { pdf ->
                    val total = pdf.pageCount
                    pdf.openPage(pageIndex).use { page ->
                        val scale = 1500.0 / max(page.width, page.height)
                        val bitmap = Bitmap.createBitmap(
                            max(1, (page.width * scale).roundToInt()),
                            max(1, (page.height * scale).roundToInt()),
                            Bitmap.Config.ARGB_8888
                        )
                        val image = try {
                            bitmap.eraseColor(Color.WHITE)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            ByteArrayOutputStream().use { stream ->
                                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                                stream.toByteArray()
                            }
                        } finally {
                            bitmap.recycle()
                        }
                        activity.runOnUiThread { result.success(mapOf("image" to image, "total" to total)) }
                    }
                }
            } catch (error: Exception) {
                activity.runOnUiThread { result.error("PDF_FAILED", "The PDF could not be opened.", null) }
            } finally {
                file?.delete()
            }
        }
    }

    private companion object {
        const val SAVE_REQUEST = 8517
    }
}
