#include "PluginEditor.h"
#include "BinaryData.h"

WubWubEditor::WubWubEditor(WubWubProcessor& p)
    : AudioProcessorEditor(p), processor(p)
{
    setSize(500, 620);

    htmlFile = juce::File::getSpecialLocation(juce::File::tempDirectory)
                  .getChildFile("wubwub_ui.html");
    htmlFile.replaceWithData(BinaryData::ui_html, BinaryData::ui_htmlSize);

    browser.onCommand = [this](const juce::String& url) { handleCommand(url); };
    addAndMakeVisible(browser);

    juce::String url = "file://" + htmlFile.getFullPathName()
        + "?mix=" + juce::String(static_cast<int>(processor.mix.load()))
        + "&mode=" + juce::String(processor.triggerMode.load())
        + "&beat=" + juce::String(processor.beatDiv.load())
        + "&threshold=" + juce::String(static_cast<int>(processor.threshold.load()));

    browser.goToURL(url);
    startTimerHz(30);
}

WubWubEditor::~WubWubEditor()
{
    stopTimer();
    htmlFile.deleteFile();
}

void WubWubEditor::timerCallback()
{
    juce::String js;

    // Fire trigger notification — JS animates playhead independently via requestAnimationFrame
    if (processor.justTriggered.exchange(false))
        js += "if(typeof onTrigger==='function')onTrigger(200);";

    // Send waveform data at ~5 Hz (every 6th tick at 30 Hz)
    static int wfTick = 0;
    if (++wfTick >= 6)
    {
        wfTick = 0;
        int head = processor.waveformHead.load();
        juce::String wfStr;
        for (int i = 0; i < WubWubProcessor::kWaveformSize; ++i)
        {
            int idx = (head + i) % WubWubProcessor::kWaveformSize;
            if (i > 0) wfStr += ",";
            wfStr += juce::String(processor.waveformBuf[idx], 3);
        }
        js += "if(typeof setWaveform==='function')setWaveform([" + wfStr + "]);";
    }

    if (js.isNotEmpty())
        browser.goToURL("javascript:" + js);
}

void WubWubEditor::resized()
{
    browser.setBounds(getLocalBounds());
}

void WubWubEditor::handleCommand(const juce::String& url)
{
    auto query = url.fromFirstOccurrenceOf("juce://set?", false, true);
    auto param = query.upToFirstOccurrenceOf("=", false, true);
    auto value = query.fromFirstOccurrenceOf("=", false, true);

    if (param == "mix")       processor.mix.store(value.getFloatValue());
    else if (param == "mode") processor.triggerMode.store(value.getIntValue());
    else if (param == "beat") processor.beatDiv.store(value.getIntValue());
    else if (param == "threshold") processor.threshold.store(value.getFloatValue());
    else if (param == "table")
    {
        float table[kTableSize];
        juce::StringArray tokens;
        tokens.addTokens(value, ",", "");
        for (int i = 0; i < std::min((int)tokens.size(), kTableSize); ++i)
            table[i] = tokens[i].getFloatValue() / 100.0f;
        processor.setEnvelopeTable(table);
    }
}
