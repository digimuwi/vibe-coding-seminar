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

    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    std::atomic<int> triggerMode { 0 };    // 0=audio, 1=midi, 2=sync
    std::atomic<int> beatDiv { 1 };        // 0=1/8, 1=1/4, 2=1/2, 3=1/1
    std::atomic<float> mix { 100.0f };     // 0-100

    void setEnvelopeTable(const float* data);

private:
    EnvelopeGenerator envelope;
    double currentSampleRate = 44100.0;

    // Transient detection
    float prevSample = 0.0f;
    float transientThreshold = 0.15f;

    // Sync tracking
    double lastBeatPos = -1.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WubWubProcessor)
};
