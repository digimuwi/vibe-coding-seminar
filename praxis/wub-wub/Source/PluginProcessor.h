#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "EnvelopeGenerator.h"

class WubWubProcessor : public juce::AudioProcessor
{
public:
    WubWubProcessor();
    ~WubWubProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Wub Wub"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    std::atomic<int> triggerMode { 0 };    // 0=audio, 1=midi, 2=sync
    std::atomic<int> beatDiv { 1 };        // 0=1/8, 1=1/4, 2=1/2, 3=1/1
    std::atomic<float> mix { 100.0f };     // 0-100
    std::atomic<float> threshold { 50.0f };// 0-100, maps to 0.05-0.5 actual threshold
    std::atomic<bool> gainSmoothing { true }; // de-click gain ramp on/off

    // For UI visualisation — written on audio thread, read on UI thread (races OK for display)
    static constexpr int kWaveformSize = 128;
    float waveformBuf[kWaveformSize] {};
    std::atomic<int> waveformHead { 0 };
    std::atomic<bool> justTriggered { false };
    std::atomic<bool> stateJustLoaded { false };

    // Saved envelope table — read by editor to restore UI after state load
    float savedTable[kTableSize] {};
    bool savedTableValid = false;

    void setEnvelopeTable(const float* data);
    float getEnvelopePhaseValue() const;

private:
    EnvelopeGenerator envelope;
    double currentSampleRate = 44100.0;

    // Audio trigger — envelope follower state
    float envFollower = 0.0f;       // smoothed sidechain level
    float envAttackCoeff = 0.0f;    // set in prepareToPlay
    float envReleaseCoeff = 0.0f;
    bool triggered = false;          // hysteresis gate
    int holdoffSamples = 0;          // hard minimum gap between triggers

    // De-click: smooth the output gain so it never jumps instantaneously
    float smoothedGain = 1.0f;      // persists across blocks
    float gainSmoothCoeff = 0.0f;   // 2ms time-constant, set in prepareToPlay

    // Sync tracking
    double lastBeatPos = -1.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WubWubProcessor)
};
