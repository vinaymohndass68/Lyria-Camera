
/**
 * @fileoverview Generates real-time music based on a webcam feed.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { LyriaCamera } from "./components/lyria_camera";

// Fix: Cast to Node to satisfy appendChild requirement as LitElement resolution may vary in this environment
document.body.appendChild(new LyriaCamera() as unknown as Node);
