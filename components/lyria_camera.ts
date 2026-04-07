
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import JSZip from "jszip";

import { html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { when } from "lit/directives/when.js";

import { urlargs } from "../utils/urlargs";
import { defineSystemPrompt } from "../utils/define_system_prompt";
import { LiveMusicHelper } from "../utils/live_music_helper";
import {
  DEFAULT_INTERVAL_PRESET,
  GEMINI_MODEL,
  IMAGE_MIME_TYPE,
  INTERVAL_PRESETS,
  MAX_CAPTURE_DIM,
  PREFERRED_STREAM_PARAMS,
} from "../utils/constants";

import styles from "./lyria_camera_styles";

import type { ToastMessage } from "./toast_message";
import "./toast_message";

import type {
  PlaybackState,
  Prompt,
  AppState,
  FacingMode,
  IntervalPreset,
  StreamSource,
  Page,
  Recording,
} from "../utils/types";

defineSystemPrompt();

@customElement("lyria-camera")
export class LyriaCamera extends LitElement {
  // Fix: Remove override modifier as base class resolution might be failing in this environment
  static styles = styles;

  private liveMusicHelper!: LiveMusicHelper;
  private ai!: GoogleGenAI;

  @state() private page: Page = "splash";
  @state() private appState: AppState = "idle";
  @state() private playbackState: PlaybackState = "stopped";

  @state() private prompts: Prompt[] = [];
  @state() private promptsStale = false;
  @state() private promptsLoading = false;

  @state() private hasAudioChunks = false;

  @state() private supportsScreenShare = false;
  @state() private hasMultipleCameras = false;

  @state() private isVideoFlipped = false;

  @state() private lastCapturedImage: string | null = null;
  @state() private currentFacingMode: FacingMode = "environment";
  @state() private currentSource: StreamSource = "none";
  @state() private intervalPreset = DEFAULT_INTERVAL_PRESET;
  @state() private captureCountdown = 0;

  @state() private recordings: Recording[] = [];
  @state() private isRecording = false;

  @query("video") private videoElement!: HTMLVideoElement;
  @query("toast-message") private toastMessageElement!: ToastMessage;

  private canvasElement: HTMLCanvasElement = document.createElement("canvas");

  private nextCaptureTime = 0;
  private timerRafId: number | null = null;
  private crossfadeIntervalId: number | null = null;

  private currentWeightedPrompts: Prompt[] = [];

  // Fix: Remove override modifier to solve 'containing class does not extend another class' error
  async connectedCallback() {
    super.connectedCallback();

    // Fix: Initialization updated to follow the official GenAI SDK guidelines
    this.ai = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });

    this.liveMusicHelper = new LiveMusicHelper(this.ai, "lyria-realtime-exp");

    this.liveMusicHelper.addEventListener(
      "playback-state-changed",
      (e: CustomEvent<PlaybackState>) => this.handlePlaybackStateChange(e),
    );

    this.liveMusicHelper.addEventListener(
      "prompts-fresh",
      () => (this.promptsStale = false),
    );

    this.liveMusicHelper.addEventListener("error", (e: CustomEvent<string>) => {
      this.dispatchError(e.detail);
    });

    if (urlargs.debugPrompts) {
      this.prompts = [
        { text: "Ambient synth pads", weight: 1.0 },
        { text: "Lofi hip hop drums", weight: 1.0 },
        { text: "Jazzy piano chords", weight: 1.0 },
      ];
    }

    this.supportsScreenShare = !!navigator.mediaDevices?.getDisplayMedia;
    void this.updateCameraCapabilities();
  }

  // Fix: Remove override modifier
  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopTimer();
    this.stopCurrentStream();
    this.liveMusicHelper.removeEventListener(
      "playback-state-changed",
      this.handlePlaybackStateChange.bind(this),
    );
    this.liveMusicHelper.removeEventListener(
      "prompts-fresh",
      () => (this.promptsStale = false),
    );
  }

  private stopCurrentStream() {
    if (!this.videoElement.srcObject) return;
    (this.videoElement.srcObject as MediaStream)
      .getTracks()
      .forEach((track) => track.stop());
  }

  private async updateCameraCapabilities() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    this.hasMultipleCameras = videoDevices.length > 1;
  }

  private async setupCamera() {
    this.stopCurrentStream();

    const facingModesToTry: FacingMode[] = [
      this.currentFacingMode,
      this.currentFacingMode === "user" ? "environment" : "user",
    ];

    let stream: MediaStream | null = null;
    for (const facingMode of facingModesToTry) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...PREFERRED_STREAM_PARAMS,
            facingMode,
          },
        });
        this.currentFacingMode = facingMode;
        break;
      } catch (e) {
        console.warn(`Could not get ${facingMode} camera.`, e);
      }
    }

    if (!stream) {
      this.dispatchError(
        "Could not access webcam. Please grant camera permission.",
      );
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const flipped = settings.facingMode !== "environment";
    this.setStream(stream, "camera", flipped);
  }

  private async switchCamera() {
    this.currentFacingMode =
      this.currentFacingMode === "user" ? "environment" : "user";
    await this.setupCamera();
  }

  private async setupScreenShare() {
    try {
      this.stopCurrentStream();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      this.setStream(stream, "screen", false);
    } catch (err) {
      console.error("Error starting screen share:", err);
      this.dispatchError("Could not start screen sharing.");
    }
  }

  private setStream(
    stream: MediaStream,
    source: StreamSource,
    flipped: boolean,
  ) {
    if (!stream) return;
    this.isVideoFlipped = flipped;
    this.videoElement.srcObject = stream;
    this.videoElement.onloadedmetadata = async () => {
      await this.videoElement.play();
      this.currentSource = source;
      this.page = "main";
      void this.updateCameraCapabilities();
    };

    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => this.handleStreamEnded());
    });
  }

  private async handleStreamEnded() {
    await this.requestStop();
    this.currentSource = "none";
    this.page = "splash";
  }

  private startTimer() {
    this.stopTimer();
    this.nextCaptureTime =
      performance.now() + this.intervalPreset.captureSeconds * 1000;
    this.tick();
  }

  private tick = () => {
    const remainingMs = this.nextCaptureTime - performance.now();
    this.captureCountdown = Math.max(0, Math.ceil(remainingMs / 1000));

    if (remainingMs <= 0) {
      void this.captureAndGenerate();
    } else {
      this.timerRafId = requestAnimationFrame(this.tick);
    }
  };

  private stopTimer() {
    if (!this.timerRafId) return;
    cancelAnimationFrame(this.timerRafId);
    this.timerRafId = null;
  }

  private async captureAndGenerate() {
    if (this.promptsLoading || !["main", "interval", "recordings"].includes(this.page))
      return;

    this.promptsLoading = true;

    const snapshotDataUrl = this.getStreamSnapshot();
    this.lastCapturedImage = snapshotDataUrl;
    const base64ImageData = snapshotDataUrl.split(",")[1];

    try {
      const response = await this.ai.models.generateContent(
        this.getGenerateContentParams(base64ImageData),
      );

      const json = JSON.parse(response.text);
      const newPromptTexts: string[] = json.prompts;

      if (this.appState === "idle") return;

      this.prompts = newPromptTexts.map((text) => ({
        text: text,
        weight: 1.0,
        isNew: true,
      }));

      setTimeout(() => {
        this.prompts = this.prompts.map((p) => ({ ...p, isNew: false }));
      }, 1000);

      this.startCrossfade(newPromptTexts);

      if (this.appState === "pendingStart") {
        await this.liveMusicHelper.play();
        this.appState = "playing";
      }
    } catch (e) {
      console.error(e);
      this.dispatchError("Failed to generate prompts from image.");
    } finally {
      this.promptsLoading = false;
      if (this.appState === "pendingStart") {
        this.appState = "idle";
      }
      if (this.hasAudioChunks) {
        this.startTimer();
      }
    }
  }

  private getStreamSnapshot() {
    const { videoWidth, videoHeight } = this.videoElement;
    let drawWidth = videoWidth;
    let drawHeight = videoHeight;

    if (drawWidth > MAX_CAPTURE_DIM || drawHeight > MAX_CAPTURE_DIM) {
      const aspectRatio = drawWidth / drawHeight;
      if (drawWidth > drawHeight) {
        drawWidth = MAX_CAPTURE_DIM;
        drawHeight = MAX_CAPTURE_DIM / aspectRatio;
      } else {
        drawHeight = MAX_CAPTURE_DIM;
        drawWidth = MAX_CAPTURE_DIM * aspectRatio;
      }
    }

    this.canvasElement.width = drawWidth;
    this.canvasElement.height = drawHeight;

    const context = this.canvasElement.getContext("2d");
    context.drawImage(this.videoElement, 0, 0, drawWidth, drawHeight);

    return this.canvasElement.toDataURL(IMAGE_MIME_TYPE);
  }

  private getGenerateContentParams(base64ImageData: string) {
    return {
      model: GEMINI_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: IMAGE_MIME_TYPE,
              data: base64ImageData,
            },
          },
          {
            text: window.systemPrompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prompts: {
              type: Type.ARRAY,
              description: "A list of 3 creative music prompts.",
              items: {
                type: Type.STRING,
              },
            },
          },
        },
      },
    };
  }

  private sendWeightedPrompts(weighted: Prompt[]) {
    const hasActive = weighted.some((p) => p.weight > 0);
    if (!hasActive) return;
    this.promptsStale = true;
    void this.liveMusicHelper.setWeightedPrompts(weighted);
  }

  private startCrossfade(newPromptTexts: string[]) {
    let crossfadeSeconds = this.intervalPreset.crossfadeSeconds;
    if (this.currentWeightedPrompts.length === 0) {
      crossfadeSeconds = 0;
    }

    this.stopCrossfade();

    const targetPrompts = newPromptTexts.map((text) => ({
      text,
      weight: 0,
    }));

    const fromPrompts = [...this.currentWeightedPrompts];
    const startTime = performance.now();
    const durationMs = crossfadeSeconds * 1000;

    const update = () =>
      this.updateCrossfade(fromPrompts, targetPrompts, startTime, durationMs);

    update();

    if (crossfadeSeconds > 0) {
      this.crossfadeIntervalId = window.setInterval(update, 2000);
    }
  }

  private stopCrossfade() {
    if (this.crossfadeIntervalId) {
      clearInterval(this.crossfadeIntervalId);
      this.crossfadeIntervalId = null;
    }
  }

  private updateCrossfade(
    fromPrompts: Prompt[],
    targetPrompts: Prompt[],
    startTime: number,
    durationMs: number,
  ) {
    const now = performance.now();
    const t = durationMs > 0 ? Math.min(1, (now - startTime) / durationMs) : 1;

    const fadedOut = fromPrompts.map((p) => ({
      ...p,
      weight: p.weight * (1 - t),
    }));
    const fadedIn = targetPrompts.map((p) => ({ ...p, weight: t }));

    const blended = [...fadedOut, ...fadedIn];
    this.currentWeightedPrompts = blended;
    this.sendWeightedPrompts(blended);

    if (t >= 1 || this.appState === "idle") {
      this.stopCrossfade();
    }
  }

  private handlePlaybackStateChange(e: CustomEvent<PlaybackState>) {
    this.playbackState = e.detail;

    if (this.playbackState === "playing" && !this.hasAudioChunks) {
      this.hasAudioChunks = true;
      this.startTimer();
    }

    if (this.playbackState === "paused") {
      this.stopTimer();
      this.captureCountdown = 0;
    }
  }

  private async handlePlayPause() {
    if (this.page !== "main" && this.page !== "recordings") return;
    switch (this.appState) {
      case "idle": {
        this.appState = "pendingStart";
        await this.captureAndGenerate();
        return;
      }
      case "pendingStart":
      case "playing": {
        await this.requestStop();
        return;
      }
    }
  }

  private async requestStop() {
    this.stopTimer();
    this.prompts = [];
    this.liveMusicHelper.stop();
    this.appState = "idle";
    this.hasAudioChunks = false;
    this.currentWeightedPrompts = [];
    this.lastCapturedImage = null;
    this.promptsLoading = false;
    this.promptsStale = false;
    this.isRecording = false;
  }

  private captureNow() {
    if (this.promptsLoading || !["main", "recordings"].includes(this.page)) return;
    this.nextCaptureTime = performance.now();
  }

  private openIntervalSheet = () => {
    this.page = "interval";
  };

  private closeIntervalSheet = () => {
    this.page = "main";
  };

  private openRecordingsSheet = () => {
    this.page = "recordings";
  };

  private toggleRecording = async () => {
    if (this.isRecording) {
      const blob = await this.liveMusicHelper.stopRecording();
      if (blob) {
        const timestamp = Date.now();
        const id = crypto.randomUUID();
        const name = `Lyria_${new Date(timestamp).toISOString().replace(/[:.]/g, '-')}.webm`;
        const url = URL.createObjectURL(blob);
        this.recordings = [...this.recordings, { id, name, blob, url, timestamp }];
      }
      this.isRecording = false;
    } else {
      if (this.playbackState !== "playing") {
        this.dispatchError("Start music before recording.");
        return;
      }
      this.liveMusicHelper.startRecording();
      this.isRecording = true;
    }
  };

  private async downloadZip() {
    if (this.recordings.length === 0) return;
    
    const zip = new JSZip();
    const folder = zip.folder("lyria-recordings");
    
    this.recordings.forEach((rec) => {
      folder?.file(rec.name, rec.blob);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lyria-recordings.zip";
    link.click();
    URL.revokeObjectURL(url);
  }

  private deleteRecording(id: string) {
    const rec = this.recordings.find(r => r.id === id);
    if (rec) URL.revokeObjectURL(rec.url);
    this.recordings = this.recordings.filter(r => r.id !== id);
  }

  private setIntervalPreset(preset: IntervalPreset) {
    this.intervalPreset = preset;
    if (this.appState !== "idle") this.startTimer();
  }

  private formatCountdown(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  private dispatchError(message: string) {
    this.toastMessageElement.show(message);
  }

  // Fix: Remove override modifier and cast to any to resolve classList access error
  render() {
    (this as any).classList?.toggle("screenshare", this.currentSource === "screen");
    return html`
      <div id="video-container">
        <video
          playsinline
          muted
          style=${styleMap({
            transform: this.isVideoFlipped ? "scaleX(-1)" : "none",
          })}
        ></video>
      </div>
      <div
        id="overlay"
        class=${classMap({
          "has-played": this.hasAudioChunks,
        })}
      >
        ${this.renderPage()}
      </div>
      <toast-message></toast-message>
    `;
  }

  private renderPage() {
    switch (this.page) {
      case "splash":
        return this.renderSplash();
      case "main":
        return this.renderMain();
      case "interval":
        return this.renderIntervalSheet();
      case "recordings":
        return this.renderRecordingsSheet();
      default:
        return nothing;
    }
  }

  private renderSplash() {
    return html`
      <div id="splash">
        <button class="control-button" @click=${this.setupCamera}>
          <span class="material-icons-round">videocam</span>
          Start Camera
        </button>
        ${when(
          this.supportsScreenShare,
          () => html`
            <button class="control-button" @click=${this.setupScreenShare}>
              <span class="material-icons-round">screen_share</span>
              Share Screen
            </button>
          `,
        )}
        <p>
          Turn your world into music with
          <a
            href="https://deepmind.google/models/lyria/lyria-realtime/"
            target="_blank"
            >Lyria RealTime</a
          >.
        </p>
      </div>
    `;
  }

  private renderMain() {
    const videoStyles = {
      transform: this.isVideoFlipped ? "scaleX(-1)" : "none",
    };

    return html`
      ${when(
        this.hasMultipleCameras && this.currentSource === "camera",
        () => html`
          <button id="camera-switch-button" @click=${this.switchCamera}>
            <span class="material-icons-outlined">flip_camera_android</span>
          </button>
        `,
      )}
      <div id="prompts-container">
        ${this.prompts.map((prompt, i) => {
          const promptClasses = {
            "prompt-tag": true,
            new: prompt.isNew || false,
            stale: this.promptsStale,
          };
          return html`
            <div
              class=${classMap(promptClasses)}
              style=${styleMap({ "animation-delay": `${i * 100}ms` })}
            >
              ${prompt.text}
            </div>
          `;
        })}
      </div>
      <div id="controls-container">
        <div id="controls">
          <div id="control-stack">
            ${this.renderPlayPauseButton()}
            <div
              id="capture-wrapper"
              class=${classMap({
                hidden: this.playbackState !== "playing",
              })}
            >
              <button
                class=${classMap({ "control-button": true, recording: this.isRecording })}
                @click=${this.toggleRecording}
              >
                <span class="material-icons-round">${this.isRecording ? 'stop' : 'fiber_manual_record'}</span>
                ${this.isRecording ? 'Stop Recording' : 'Record'}
              </button>
              <button
                class="control-button"
                @click=${this.captureNow}
                ?disabled=${this.promptsLoading}
              >
                <span class="material-icons-outlined">photo_camera</span>
                Capture Now
              </button>
            </div>
            ${this.renderStatusText()}
          </div>
        </div>
      </div>
      <div
        id="pip-container"
        class=${classMap({
          visible: !!this.lastCapturedImage,
        })}
        @click=${this.openIntervalSheet}
      >
        ${when(
          this.lastCapturedImage,
          () => html`
            <img src=${this.lastCapturedImage} style=${styleMap(videoStyles)} />
          `,
        )}
        ${when(
          this.promptsLoading || this.playbackState === "loading" || this.promptsStale,
          () => html`
            <div class="pip-loading-overlay">
              <div class="pip-spinner"></div>
            </div>
          `,
        )}
      </div>

      <div id="side-actions">
        <button class="action-btn" @click=${this.openIntervalSheet}>
          <span class="material-icons-outlined">timer</span>
        </button>
        <button class="action-btn" @click=${this.openRecordingsSheet}>
          <span class="material-icons-outlined">library_music</span>
          ${when(this.recordings.length > 0, () => html`<span class="badge">${this.recordings.length}</span>`)}
        </button>
      </div>
    `;
  }

  private renderStatusText() {
    const classes = {
      shimmer: this.promptsLoading || this.playbackState === "loading" || this.promptsStale,
    };

    let text = "";
    if (this.promptsLoading) {
      text = "Getting prompts...";
    } else if (this.playbackState === "loading" || this.promptsStale) {
      text = "Generating music...";
    } else if (this.captureCountdown > 0 && this.playbackState === "playing") {
      text = `Next capture in ${this.formatCountdown(this.captureCountdown)}`;
    } else if (this.appState === "idle") {
      text = "Press play to generate";
    }

    return html`<div id="status-text" class=${classMap(classes)}>${text}</div>`;
  }

  private renderIntervalSheet() {
    return html`<div id="sheet-backdrop" @click=${this.closeIntervalSheet}></div>
      <div id="sheet">
        <div class="sheet-header">
          <div class="sheet-title">Capture Interval</div>
          <button class="sheet-close" @click=${this.closeIntervalSheet}>✕</button>
        </div>
        <div class="interval-options">
          ${INTERVAL_PRESETS.map(
            (p) => html`
              <div class="interval-option" @click=${() => this.setIntervalPreset(p)}>
                <div class="circle ${this.intervalPreset === p ? 'selected' : ''}">
                  <div class="value">${p.labelValue}</div>
                  <div class="sub">${p.labelSub}</div>
                </div>
              </div>
            `,
          )}
        </div>
      </div>`;
  }

  private renderRecordingsSheet() {
    return html`<div id="sheet-backdrop" @click=${this.closeIntervalSheet}></div>
      <div id="sheet">
        <div class="sheet-header">
          <div class="sheet-title">Saved Recordings</div>
          <button class="sheet-close" @click=${this.closeIntervalSheet}>✕</button>
        </div>
        <div id="recordings-list">
          ${this.recordings.length === 0 
            ? html`<div class="empty-state">No recordings yet. Press 'Record' to save music.</div>`
            : html`
              ${this.recordings.map(rec => html`
                <div class="recording-item">
                  <div class="rec-info">
                    <div class="rec-name">${rec.name}</div>
                    <div class="rec-meta">${new Date(rec.timestamp).toLocaleString()}</div>
                  </div>
                  <div class="rec-actions">
                    <a href=${rec.url} target="_blank" class="rec-btn" download=${rec.name}>
                      <span class="material-icons-outlined">download</span>
                    </a>
                    <button class="rec-btn delete" @click=${() => this.deleteRecording(rec.id)}>
                      <span class="material-icons-outlined">delete</span>
                    </button>
                  </div>
                </div>
              `)}
              <button class="control-button zip-btn" @click=${this.downloadZip}>
                <span class="material-icons-outlined">archive</span>
                Download All (ZIP)
              </button>
            `
          }
        </div>
      </div>`;
  }

  private renderPlayPauseButton() {
    const isPlaying =
      this.appState === "pendingStart" ||
      this.appState === "playing" ||
      this.playbackState === "loading" ||
      this.playbackState === "playing" ||
      this.timerRafId !== null;

    return html`<button
      class="playpause-button"
      @click=${this.handlePlayPause}
      aria-label=${isPlaying ? "Stop" : "Play"}
    >
      <div class="playpause-visual">
        <div class="playpause-ring"></div>
        ${isPlaying
          ? html`<div class="playpause-inner square"></div>`
          : html`<span class="material-icons-round playpause-play-icon">play_arrow</span>`}
      </div>
    </button>`;
  }
}
