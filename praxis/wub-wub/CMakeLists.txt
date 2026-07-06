cmake_minimum_required(VERSION 3.22)
project(WubWub VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)

include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(WubWub
    COMPANY_NAME "VibeCoding"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    PLUGIN_MANUFACTURER_CODE Vibe
    PLUGIN_CODE WbWb
    FORMATS Standalone VST3 AU
    PRODUCT_NAME "Wub Wub"
)

target_sources(WubWub PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/EnvelopeGenerator.cpp
)

juce_add_binary_data(WubWubData SOURCES
    Resources/ui.html
)

target_compile_definitions(WubWub PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(WubWub
    PRIVATE
        WubWubData
        juce::juce_audio_utils
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)
