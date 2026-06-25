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
        + "&beat=" + juce::String(processor.beatDiv.load());

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
    float phase = processor.getEnvelopePhaseValue();
    if (phase >= 0.0f)
    {
        juce::String js = "if(typeof setPhase==='function')setPhase(" + juce::String(phase, 3) + ");";
        browser.goToURL("javascript:" + js);
    }
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
