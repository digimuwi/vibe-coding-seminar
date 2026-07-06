#include "PluginProcessor.h"
#include "PluginEditor.h"

WubWubProcessor::WubWubProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true)
          .withInput("Sidechain", juce::AudioChannelSet::mono(), false))
{
}

void WubWubProcessor::prepareToPlay(double sampleRate, int)
{
    currentSampleRate = sampleRate;
    // Envelope follower: 3ms attack (fast enough to catch transients),
    // 150ms release (long enough to bridge the kick body without re-arming)
    envAttackCoeff  = std::exp(-1.0f / (float(sampleRate) * 0.003f));
    envReleaseCoeff = std::exp(-1.0f / (float(sampleRate) * 0.150f));
    envFollower     = 0.0f;
    triggered       = false;
    holdoffSamples  = 0;
    // 2ms gain smoother — prevents click when gain jumps on trigger
    gainSmoothCoeff = std::exp(-1.0f / (float(sampleRate) * 0.002f));
    smoothedGain    = 1.0f;
    lastBeatPos     = -1.0;
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
                justTriggered.store(true);
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
                        {
                            envelope.trigger();
                            justTriggered.store(true);
                        }

                        lastBeatPos = beatPos;
                    }
                }
                else
                {
                    // DAW stopped — reset so we don't get spurious triggers on next play
                    lastBeatPos = -1.0;
                }
            }
        }
    }

    // Audio trigger: per-sample envelope follower → threshold comparison
    if (mode == 0)
    {
        // Get sidechain read pointer (falls back to main input if no sidechain)
        const float* scPtr = nullptr;
        if (getBusCount(true) > 1)
        {
            auto sc = getBusBuffer(buffer, true, 1);
            if (sc.getNumChannels() > 0 && sc.getNumSamples() == numSamples)
                scPtr = sc.getReadPointer(0);
        }
        if (scPtr == nullptr && numChannels > 0)
            scPtr = buffer.getReadPointer(0);

        // Run AR envelope follower per-sample
        if (scPtr != nullptr)
        {
            for (int i = 0; i < numSamples; ++i)
            {
                float absS = std::abs(scPtr[i]);
                float c = (absS > envFollower) ? envAttackCoeff : envReleaseCoeff;
                envFollower = c * envFollower + (1.0f - c) * absS;
            }
        }

        // Threshold comparison (same scale as JS meter: lvl = envFollower*4, thr = threshold/100)
        float thrLevel = threshold.load() / 400.0f;

        if (holdoffSamples > 0) holdoffSamples -= numSamples;

        // Re-arm hysteresis: must drop to 25% of threshold before next trigger
        if (triggered && envFollower < thrLevel * 0.25f)
            triggered = false;

        // Fire on rising edge only
        if (!triggered && thrLevel > 0.001f && envFollower >= thrLevel && holdoffSamples <= 0)
        {
            envelope.trigger();
            justTriggered.store(true);
            triggered = true;
            holdoffSamples = static_cast<int>(currentSampleRate * 0.12f); // 120ms hard gap
        }
    }

    // Per-sample processing
    const bool doSmooth = gainSmoothing.load();
    for (int i = 0; i < numSamples; ++i)
    {
        float targetGain = 1.0f - mixAmt * (1.0f - envelope.processSample(currentSampleRate));
        // Smooth toward target to avoid clicks on trigger (2ms time constant)
        if (doSmooth)
            smoothedGain = gainSmoothCoeff * smoothedGain + (1.0f - gainSmoothCoeff) * targetGain;
        else
            smoothedGain = targetGain;

        for (int ch = 0; ch < numChannels; ++ch)
            buffer.getWritePointer(ch)[i] *= smoothedGain;
    }

    // Store envelope follower level in waveform display buffer
    // (same signal the threshold is compared against — meter is 1:1 with trigger)
    int head = waveformHead.load();
    waveformBuf[head % kWaveformSize] = (mode == 0) ? envFollower : ([&]{
        float r = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch) r += buffer.getRMSLevel(ch, 0, numSamples);
        return numChannels > 0 ? r / numChannels : 0.0f;
    }());
    waveformHead.store(head + 1);
}

juce::AudioProcessorEditor* WubWubProcessor::createEditor()
{
    return new WubWubEditor(*this);
}

void WubWubProcessor::setEnvelopeTable(const float* data)
{
    envelope.setTable(data);
    std::memcpy(savedTable, data, kTableSize * sizeof(float));
    savedTableValid = true;
}

float WubWubProcessor::getEnvelopePhaseValue() const
{
    return envelope.getPhase();
}

void WubWubProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::XmlElement xml("WubWubState");
    xml.setAttribute("mix",           (double)mix.load());
    xml.setAttribute("threshold",     (double)threshold.load());
    xml.setAttribute("mode",          triggerMode.load());
    xml.setAttribute("beat",          beatDiv.load());
    xml.setAttribute("gainSmoothing", (int)gainSmoothing.load());

    if (savedTableValid)
    {
        juce::String tbl;
        for (int i = 0; i < kTableSize; ++i)
        {
            if (i > 0) tbl += ",";
            tbl += juce::String(savedTable[i], 4);
        }
        xml.setAttribute("table", tbl);
    }

    copyXmlToBinary(xml, destData);
}

void WubWubProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
    {
        mix.store      ((float)xml->getDoubleAttribute("mix",       100.0));
        threshold.store((float)xml->getDoubleAttribute("threshold",  50.0));
        triggerMode.store(      xml->getIntAttribute   ("mode",        0));
        beatDiv.store  (        xml->getIntAttribute   ("beat",        1));
        gainSmoothing.store(    xml->getIntAttribute   ("gainSmoothing", 1) != 0);

        juce::String tbl = xml->getStringAttribute("table");
        if (tbl.isNotEmpty())
        {
            juce::StringArray tokens;
            tokens.addTokens(tbl, ",", "");
            if (tokens.size() == kTableSize)
            {
                for (int i = 0; i < kTableSize; ++i)
                    savedTable[i] = tokens[i].getFloatValue();
                savedTableValid = true;
                envelope.setTable(savedTable);
            }
        }

        stateJustLoaded.store(true);
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new WubWubProcessor();
}
