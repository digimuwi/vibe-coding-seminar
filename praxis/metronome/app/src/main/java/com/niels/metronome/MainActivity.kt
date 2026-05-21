package com.niels.metronome

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import com.niels.metronome.databinding.ActivityMainBinding
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile private var oMin = 60.0
    @Volatile private var oMax = 120.0
    @Volatile private var oPeriodBeats = 16.0

    @Volatile private var isRunning = false
    private var engineThread: Thread? = null

    // Beat timing — updated on the audio thread per beat, used by the UI thread for interpolation
    @Volatile private var lastBeatAtNanos: Long = 0L
    @Volatile private var nextBeatAtNanos: Long = 0L
    @Volatile private var lastBeatPhase: Double = 0.0      // phase (0..2π) at last beat
    @Volatile private var nextBeatPhase: Double = 0.0      // phase at next beat

    private val sampleRate = 48000

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (!isRunning) return
            val now = System.nanoTime()
            val span = (nextBeatAtNanos - lastBeatAtNanos).toDouble().coerceAtLeast(1.0)
            val frac = ((now - lastBeatAtNanos).toDouble() / span).coerceIn(0.0, 1.0)
            val phase = lastBeatPhase + (nextBeatPhase - lastBeatPhase) * frac
            val u = ((1.0 - cos(phase)) / 2.0).toFloat().coerceIn(0f, 1f)
            binding.ballView.position = u
            binding.ballView.invalidate()
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        updateBallLabels()

        binding.playButton.setOnClickListener {
            if (isRunning) stop() else start()
        }
    }

    override fun onStop() {
        super.onStop()
        stop()
    }

    private fun updateBallLabels() {
        binding.ballView.minLabel = "${oMin.toInt()}"
        binding.ballView.maxLabel = "${oMax.toInt()}"
        binding.ballView.invalidate()
    }

    private fun readFields(): Boolean {
        return try {
            oMin = binding.oscMinBpm.text.toString().toDouble().coerceAtLeast(1.0)
            oMax = binding.oscMaxBpm.text.toString().toDouble().coerceAtLeast(1.0)
            oPeriodBeats = binding.oscPeriodBeats.text.toString().toDouble().coerceAtLeast(0.5)
            updateBallLabels()
            true
        } catch (_: NumberFormatException) {
            false
        }
    }

    private fun start() {
        if (!readFields()) return
        if (isRunning) return
        isRunning = true
        binding.playButton.text = "■"
        engineThread = Thread { runEngine() }.apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
        Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    private fun stop() {
        isRunning = false
        engineThread?.join(500)
        engineThread = null
        Choreographer.getInstance().removeFrameCallback(frameCallback)
    }

    private fun bpmAtPhase(phase: Double): Double {
        val u = (1.0 - cos(phase)) / 2.0
        return oMin * (oMax / oMin).pow(u)
    }

    private fun runEngine() {
        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val bufferSize = (minBuf * 4).coerceAtLeast(sampleRate / 4)

        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(bufferSize)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        track.play()

        val click = generateClick(1200.0, 0.06)
        val silencePool = ShortArray(sampleRate / 10)

        var beatIndex = 0.0

        while (isRunning) {
            val phase = beatIndex * (2.0 * PI / oPeriodBeats)   // recompute with live period
            val bpm = bpmAtPhase(phase)

            val beatStartNanos = System.nanoTime()
            val samplesPerBeat = (60.0 / bpm * sampleRate).toLong().coerceAtLeast(1L)
            val beatDurationNanos = (samplesPerBeat.toDouble() / sampleRate * 1_000_000_000).toLong()

            lastBeatAtNanos = beatStartNanos
            nextBeatAtNanos = beatStartNanos + beatDurationNanos
            lastBeatPhase = phase
            nextBeatPhase = phase + (2.0 * PI / oPeriodBeats)

            mainHandler.post { binding.bpmLabel.text = bpm.toInt().toString() }

            track.write(click, 0, click.size)
            var silenceRemaining = samplesPerBeat - click.size
            while (isRunning && silenceRemaining > 0) {
                val chunk = minOf(silenceRemaining, silencePool.size.toLong()).toInt()
                track.write(silencePool, 0, chunk)
                silenceRemaining -= chunk
            }

            beatIndex += 1.0
            if (beatIndex >= oPeriodBeats) beatIndex -= oPeriodBeats
        }

        track.stop()
        track.release()

        mainHandler.post { binding.playButton.text = "▶" }
    }

    private fun generateClick(freqHz: Double, durationSec: Double): ShortArray {
        val n = (sampleRate * durationSec).toInt()
        val out = ShortArray(n)
        val decay = 25.0
        for (i in 0 until n) {
            val t = i / sampleRate.toDouble()
            val env = exp(-t * decay)
            val sample = sin(2 * PI * freqHz * t) * env
            out[i] = (sample * Short.MAX_VALUE * 0.9).toInt().toShort()
        }
        return out
    }
}
