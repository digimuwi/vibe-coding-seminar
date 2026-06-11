#pragma once
#include <cmath>
#include <algorithm>
#include <cstring>

constexpr int kTableSize = 64;

class EnvelopeGenerator {
public:
    void trigger();
    void setTable(const float* data);
    void setDurationMs(float ms) { durationMs = std::max(1.0f, ms); }
    float processSample(double sampleRate);
    bool isActive() const { return active; }

private:
    float table[kTableSize];
    float durationMs = 200.0f;
    float elapsedMs = 0.0f;
    bool active = false;

    float lookupGain(float t) const;
};
