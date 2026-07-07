---
title: WUB WUB – Building an Audio Plugin with AI
slideOptions:
  theme: black
  transition: slide
---

# WUB WUB 🎛️
### Building a Logic Pro Sidechain Plugin with AI
#### A Development Diary

---

## What is Wub Wub?

A **sidechain ducking** audio plugin for Logic Pro

> When a kick drum hits → the plugin ducks another track

- The classic "pumping" sound in EDM, pop, hip-hop
- Usually done with a compressor and a sidechain signal
- Wub Wub replaces that with a **custom drawn envelope curve**

---

## The Idea

The user had the sound in their head:
> *"I want to draw exactly how the duck sounds — not just attack/release knobs"*

Key insight: **the envelope shape is the creative decision**

So the whole plugin was built around a **curve editor** instead of the usual knobs

---

## The Stack

| Layer | Technology |
|---|---|
| Audio processing | JUCE 8 (C++) |
| Build system | CMake → Xcode |
| Plugin format | AU (Audio Unit) |
| UI | HTML/CSS/JS in a WebView |
| DAW | Logic Pro |

Why HTML for the UI? → No JUCE component boilerplate, full creative control over look

---

## Episode 1: VST3 Won't Work in Logic

**Problem:** Built as VST3 first. Logic Pro doesn't load VST3.

**User's input:**
> *"it doesn't show up in Logic"*

**Fix:** Switched to AU (Audio Unit) format — the native macOS plugin format

```cmake
FORMATS Standalone VST3 AU
```

Lesson: Logic Pro users need AU. The user knew this from their DAW experience.

---

## Episode 2: The Invisible Plugin

**Problem:** AU built, installed — still not appearing in Logic Pro

Three culprits:
1. **Stale AU cache** — Logic caches all plugins on first scan
2. **Wrong plugin type** — `aumf` (Music Effect) doesn't get a Side Chain dropdown → needed `aufx` (Audio Effect)
3. **`isBusesLayoutSupported` too strict** — rejected Logic's probe during validation

**Fix:**
```bash
rm -rf ~/Library/Caches/AudioUnitCache
defaults delete com.apple.audio.AudioComponentRegistrar
```
→ Added to `build.sh` so it runs automatically every build

---

## Episode 3: The Sidechain Bus

For `aufx` type + sidechain to appear in Logic's plugin header:

```cpp
WubWubProcessor()
  : AudioProcessor(
      BusesProperties()
        .withInput("Input",    stereo, true)
        .withOutput("Output",  stereo, true)
        .withInput("Sidechain", mono,  false))  // ← this
```

**Validated with:**
```
auval -v aufx WbWb Vibe
→ AU VALIDATION SUCCEEDED
```

The Side Chain dropdown appeared in Logic Pro ✅

---

## Episode 4: The Envelope Editor

The creative heart of the plugin — a **Catmull-Rom spline editor**

- Click to add points
- Drag to move them
- Double-click to remove
- 64-point LUT sent to C++ for audio processing
- Playhead animates through the curve on every trigger

7 preset shapes: Linear, Expo, Smooth, SmoothExp, FastAtk, SlowRel, DblPeak

---

## Episode 5: The Sidechain Meter

**User's input:**
> *"I want to see what the sidechain is doing"*

→ Full-width waveform meter, bars rising from bottom

**User's refinement:**
> *"I want to drag the threshold line directly on the meter"*

→ Removed the threshold knob entirely, replaced with a **draggable dashed line** on the canvas

The threshold line IS the interaction. No knob needed.

---

## Episode 6: False Triggers 🐛

**Problem:**
> *"it kinda works but its quite buggy — the kick doesn't trigger falsly [sic]"*

**Root cause:** Block-level RMS fluctuates. A kick's body makes RMS bounce above/below threshold multiple times → one kick = many triggers

**Block RMS (bad):**
```
Block 1: 0.08  ← trigger!
Block 2: 0.04  ← drops (re-arms)
Block 3: 0.07  ← trigger again!
```

---

## Episode 7: Envelope Follower Fix

**Solution:** Per-sample AR envelope follower

```cpp
// 3ms attack — fast enough to catch the transient
envAttackCoeff  = exp(-1 / (sampleRate * 0.003));

// 150ms release — long enough to bridge kick body + room
envReleaseCoeff = exp(-1 / (sampleRate * 0.150));

// Per sample:
float c = (abs(s) > envFollower) ? attackCoeff : releaseCoeff;
envFollower = c * envFollower + (1-c) * abs(s);
```

Plus: **25% hysteresis** + **120ms hard holdoff**

The meter now shows the envelope follower level — **what you see = what triggers**

---

## Episode 8: The Click on Trigger

**User's observation:**
> *"when the trigger happens the track clips — I can hear a short clip"*

**Root cause:** Gain jumps from 1.0 → `table[0]` (near 0) in one sample = discontinuity = click

**Fix:** One-pole IIR gain smoother, 2ms time constant

```cpp
smoothedGain = gainSmoothCoeff * smoothedGain
             + (1 - gainSmoothCoeff) * targetGain;
```

User gets a toggle switch to enable/disable it: **DE-CLICK**

---

## Episode 9: The Layout Problem

**User's observation:**
> *"the UI is bigger than the plugin window"*

The layout was stacking everything vertically → total ~700px, window only 620px

Content was cut off at the bottom

**Fix:** Window bumped to 500×700, vertical breathing room restored

---

## Episode 10: Visual Polish

Three requests in one message:
> *"make the declick not a button but a switch with an animation"*
> *"whenever the sidechain triggers I want the mix knob to flash white"*
> *"if you turn down mix I want it to become darker"*

---

## The Toggle Switch

```css
.sw-track {
  transition: background .25s, border-color .25s, box-shadow .25s;
}
.sw.on .sw-thumb {
  transform: translateX(16px);
  box-shadow: 0 0 8px rgba(255,255,0,0.7);
}
```

Slides with a smooth 250ms ease. Yellow glow when active.

---

## Knob Flash + Mix Dimming

**Trigger flash** — white arc overlay fades over ~300ms:
```js
function animateKFlash(){
  kFlash = Math.max(0, kFlash - 0.05); // ~20 frames
  drawK();
  if(kFlash > 0) requestAnimationFrame(animateKFlash);
}
```

**Mix dimming** — arc opacity scales with value:
```js
var arcOpacity = 0.12 + (mix/100) * 0.88;
kx.globalAlpha = arcOpacity;
```

At mix=0: arc is barely visible. At mix=100: full yellow glow.

---

## The User's Role

This wasn't "describe what you want and AI builds it."

The user brought **domain expertise** at every step:

| Decision | Who drove it |
|---|---|
| Plugin concept (sidechain ducking) | User |
| Logic Pro / AU format requirement | User |
| Sidechain meter as core UI element | User |
| Draggable threshold (no knob) | User |
| "It triggers falsely" diagnosis | User |
| "It clips on trigger" diagnosis | User |
| Mix knob visual feedback | User |
| De-click toggle (not button) | User |

---

## What the User Knew

The user is a **Logic Pro power user and sound designer**, not a programmer

That matters because:
- They knew *why* VST3 wouldn't work (DAW knowledge)
- They recognized a false trigger *by ear* — not from a log
- They heard the click artifact immediately
- They knew what the visual feedback *should feel like* for a music production tool
- They described the mix dimming concept intuitively: *"I want it to become darker, ykwim?"*

**The AI wrote the code. The user knew what it should do.**

---

## What's Working ✅

- Logic Pro AU plugin, type `aufx`, sidechain bus visible
- Three trigger modes: Audio / MIDI / SYNC
- Custom curve editor (Catmull-Rom, 7 presets)
- Sidechain meter with draggable threshold
- Per-sample envelope follower — reliable single-trigger per kick
- De-click gain smoother (toggleable)
- State persistence (project save/restore)
- Mix knob with trigger flash + mix-level dimming
- Animated DE-CLICK toggle switch

---

## Lessons Learned

1. **Audio plugins have a lot of invisible rules** — AU type, plugin format, OS caches all bite before you write a single line of DSP

2. **The meter IS the feature** — making the visual match the trigger logic exactly (envelope follower → same signal displayed) removed hours of confusion

3. **Artifacts live at boundaries** — the click happened at the exact sample where trigger fires; you only find it when the code ships to a real DAW

4. **The user's ear > any metric** — every real improvement in this project started with the user noticing something wrong *while listening*

---

# The Plugin

```
praxis/wub-wub/
```

→ Build: `./build.sh`
→ Opens standalone + installs to Logic Pro

---

# Thanks 🎛️

*Built with JUCE · Driven by ears · Shipped with `git push`*
