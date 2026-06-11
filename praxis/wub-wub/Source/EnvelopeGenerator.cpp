#include "EnvelopeGenerator.h"

void EnvelopeGenerator::trigger()
{
    elapsedMs = 0.0f;
    active = true;
}

void EnvelopeGenerator::setTable(const float* data)
{
    std::memcpy(table, data, kTableSize * sizeof(float));
}

float EnvelopeGenerator::processSample(double sampleRate)
{
    if (!active)
        return 1.0f;

    float t = elapsedMs / durationMs;
    if (t >= 1.0f)
    {
        active = false;
        return 1.0f;
    }

    elapsedMs += 1000.0f / static_cast<float>(sampleRate);
    return lookupGain(t);
}

float EnvelopeGenerator::lookupGain(float t) const
{
    float pos = t * (kTableSize - 1);
    int idx = static_cast<int>(pos);
    float frac = pos - idx;

    if (idx >= kTableSize - 1)
        return table[kTableSize - 1];

    return table[idx] + frac * (table[idx + 1] - table[idx]);
}
