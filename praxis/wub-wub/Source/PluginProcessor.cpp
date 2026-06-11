#include "PluginProcessor.h"
#include "PluginEditor.h"

WubWubProcessor::WubWubProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

void WubWubProcessor::prepareToPlay(double sampleRate, int)
{
    currentSampleRate = sampleRate;
    prevSample = 0.0f;
    lastBeatPos = -1.0;
}

void WubWubProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();
    const int mode = triggerMode.load();
    const float mixAmt = mix.load() / 100.0f;

    // table is set via setEnvelopeTable from the editor

    // MIDI trigger
    if (mode == 1)
    {
        for (const auto metadata : midi)
        {
            if (metadata.getMessage().isNoteOn())
            {
                envelope.trigger();
                break;
            }
        }
    }

    // Sync trigger
    if (mode == 2)
    {
        if (auto* ph = getPlayHead())
        {
            if (auto pos = ph->getPosition())
            {
                if (pos->getIsPlaying())
                {
                    if (auto ppqOpt = pos->getPpqPosition())
                    {
                        double beatPos = *ppqOpt;
                        const double divValues[] = { 0.5, 1.0, 2.0, 4.0 };
                        double div = divValues[std::clamp(beatDiv.load(), 0, 3)];
                        double curBeat = std::fmod(beatPos, div);
                        double prevBeat = std::fmod(lastBeatPos, div);

                        if (lastBeatPos >= 0.0 && curBeat < prevBeat)
                            envelope.trigger();

                        lastBeatPos = beatPos;
                    }
                }
            }
        }
    }

    // Per-sample processing
    for (int i = 0; i < numSamples; ++i)
    {
        // Audio transient detection
        if (mode == 0 && numChannels > 0)
        {
            float sample = buffer.getSample(0, i);
            float diff = std::abs(sample) - std::abs(prevSample);
            if (diff > transientThreshold && !envelope.isActive())
                envelope.trigger();
            prevSample = sample;
        }

        float gain = envelope.processSample(currentSampleRate);
        float finalGain = 1.0f - mixAmt * (1.0f - gain);

        for (int ch = 0; ch < numChannels; ++ch)
            buffer.getWritePointer(ch)[i] *= finalGain;
    }
}

juce::AudioProcessorEditor* WubWubProcessor::createEditor()
{
    return new WubWubEditor(*this);
}

void WubWubProcessor::setEnvelopeTable(const float* data)
{
    envelope.setTable(data);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new WubWubProcessor();
}
