#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

class PluginWebBrowser : public juce::WebBrowserComponent
{
public:
    std::function<void(const juce::String&)> onCommand;

    bool pageAboutToLoad(const juce::String& url) override
    {
        if (url.startsWith("juce://"))
        {
            if (onCommand)
                onCommand(url);
            return false;
        }
        return true;
    }
};

class WubWubEditor : public juce::AudioProcessorEditor
{
public:
    explicit WubWubEditor(WubWubProcessor&);
    ~WubWubEditor() override;
    void resized() override;

private:
    WubWubProcessor& processor;
    PluginWebBrowser browser;
    juce::File htmlFile;

    void handleCommand(const juce::String& url);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WubWubEditor)
};
