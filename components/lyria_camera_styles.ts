/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { css } from "lit";

export default css`
  :host {
    display: block;
    width: 100%;
    height: 100%;
    position: relative;
    background: #000;
    -webkit-font-smoothing: antialiased;
  }

  .material-icons-outlined {
    font-family: "Material Icons Outlined";
  }
  .material-icons-round {
    font-family: "Material Icons Round";
  }
  .material-icons-outlined,
  .material-icons-round {
    font-weight: normal;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-feature-settings: "liga";
    -webkit-font-smoothing: antialiased;
    width: 1.2rem;
  }

  #video-container {
    background: #000;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  :host(.screenshare) video {
    object-fit: contain;
  }

  button {
    cursor: pointer;
    background: none;
    border: none;
    color: inherit;
    font-family: inherit;
  }

  #overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: linear-gradient(
      rgba(0, 0, 0, 0.7) 50px,
      rgba(0, 0, 0, 0) 27%,
      rgba(0, 0, 0, 0) 81.7%,
      rgba(0, 0, 0, 0.933) 100%
    );
  }

  #controls-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 2rem;
    z-index: 6;
  }

  #prompts-container {
    position: absolute;
    top: 15px;
    left: 15px;
    right: 55px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    z-index: 4;
  }

  .prompt-tag {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(10px);
    padding: 0.5rem 1rem;
    border-radius: 2rem;
    font-size: 14px;
    font-weight: 400;
    animation: prompt-intro 0.5s ease-out both;
  }

  @keyframes prompt-intro {
    from { transform: translateY(-20%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .prompt-tag.stale {
    animation: pulse-opacity 1s ease-in-out infinite forwards;
  }

  @keyframes pulse-opacity {
    0%, 100% { color: #fff; }
    50% { color: #fff5; }
  }

  #control-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .playpause-button {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .playpause-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid #fff;
    background: rgba(0, 0, 0, 0.125);
  }

  .playpause-inner {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 50px;
    aspect-ratio: 1;
    background: #ff2d2d;
    border-radius: 50%;
    transition: all 150ms ease;
  }

  .playpause-inner.square {
    border-radius: 8px;
    width: 40px;
    height: 40px;
  }

  .playpause-play-icon {
    position: absolute;
    inset: 0;
    font-size: 80px;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .control-button {
    background: rgba(30, 30, 30, 0.6);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.75rem 1.25rem;
    border-radius: 2rem;
    font-size: 0.9rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }

  .control-button:hover:not(:disabled) {
    background: rgba(50, 50, 50, 0.8);
  }

  .control-button.recording {
    background: rgba(255, 0, 0, 0.2);
    border-color: rgba(255, 0, 0, 0.6);
    animation: pulse-red 1.5s infinite;
  }

  @keyframes pulse-red {
    0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
  }

  #splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
  }

  #splash .control-button {
    background: #007739;
    padding: 1rem 2rem;
    font-size: 1.1rem;
  }

  #status-text {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    height: 1.2em;
  }

  #status-text.shimmer {
    background: linear-gradient(90deg, #fff5 20%, #fff 50%, #fff5 80%);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: shimmer-slide 2s linear infinite;
  }

  @keyframes shimmer-slide {
    to { background-position: -200% 0; }
  }

  #capture-wrapper {
    display: flex;
    gap: 0.5rem;
  }

  #capture-wrapper.hidden { visibility: hidden; }

  #pip-container {
    position: absolute;
    bottom: 15px;
    left: 15px;
    width: 100px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #fff3;
    opacity: 0;
    transition: opacity 0.3s;
  }

  #pip-container.visible { opacity: 1; }
  #pip-container img { width: 100%; display: block; }

  #side-actions {
    position: absolute;
    bottom: 15px;
    right: 15px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    z-index: 6;
  }

  .action-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(0,0,0,0.5);
    border: 1px solid #fff2;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .badge {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #ff2d2d;
    color: #fff;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: bold;
  }

  #sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 5;
  }

  #sheet {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.8), rgba(0,0,0,0.95));
    display: flex;
    flex-direction: column;
    padding: 20px;
    color: #fff;
    z-index: 6;
    animation: slide-up 0.3s ease-out;
  }

  @keyframes slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .sheet-title { font-size: 1.2rem; font-weight: 500; }
  .sheet-close { font-size: 1.5rem; opacity: 0.7; }

  #recordings-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .recording-item {
    background: rgba(255,255,255,0.05);
    padding: 1rem;
    border-radius: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .rec-name { font-weight: 500; margin-bottom: 4px; }
  .rec-meta { font-size: 0.8rem; opacity: 0.5; }
  .rec-actions { display: flex; gap: 0.5rem; }
  
  .rec-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    text-decoration: none;
    color: #fff;
  }

  .rec-btn.delete { color: #ff5555; }
  .zip-btn { margin-top: 1rem; align-self: center; background: #007739; }

  .empty-state { text-align: center; margin-top: 3rem; opacity: 0.5; }

  .interval-options {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1rem;
  }

  .interval-option .circle {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 3px solid transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .interval-option .circle.selected { border-color: #fff; }
  .interval-option .value { font-size: 1.8rem; }
  .interval-option .sub { font-size: 0.7rem; letter-spacing: 0.2em; opacity: 0.7; }

  #camera-switch-button {
    position: absolute;
    top: 15px;
    right: 15px;
    z-index: 10;
  }

  .pip-spinner {
    border: 2px solid #fff3;
    border-top-color: #fff;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
`;
