package com.niels.metronome

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

class BallView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    @Volatile var position: Float = 0f   // 0..1 (0 = min BPM, 1 = max BPM)
    @Volatile var minLabel: String = ""
    @Volatile var maxLabel: String = ""

    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#333333")
        strokeWidth = 6f
        style = Paint.Style.STROKE
    }
    private val ballPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#888888")
        textSize = 32f
    }

    override fun onDraw(canvas: Canvas) {
        val padding = 48f
        val cy = height / 2f
        val leftX = padding
        val rightX = width - padding

        canvas.drawLine(leftX, cy, rightX, cy, trackPaint)

        val ballX = leftX + (rightX - leftX) * position
        canvas.drawCircle(ballX, cy, 28f, ballPaint)

        labelPaint.textAlign = Paint.Align.LEFT
        canvas.drawText(minLabel, leftX, cy + 70f, labelPaint)
        labelPaint.textAlign = Paint.Align.RIGHT
        canvas.drawText(maxLabel, rightX, cy + 70f, labelPaint)
    }
}
