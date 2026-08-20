const cameraView = document.querySelector("#cameraView");
const resultView = document.querySelector("#resultView");
const cameraStage = document.querySelector("#cameraStage");
const video = document.querySelector("#cameraVideo");
const overlay = document.querySelector("#guideOverlay");
const gridOverlay = document.querySelector("#gridOverlay");
const focusRing = document.querySelector("#focusRing");
const emptyState = document.querySelector("#emptyState");
const message = document.querySelector("#message");
const guideInput = document.querySelector("#guideInput");
const loadGuideButton = document.querySelector("#loadGuideButton");
const changeGuideButton = document.querySelector("#changeGuideButton");
const removeGuideButton = document.querySelector("#removeGuideButton");
const opacitySlider = document.querySelector("#opacitySlider");
const opacityLabel = document.querySelector("#opacityLabel");
const zoomSlider = document.querySelector("#zoomSlider");
const zoomLabel = document.querySelector("#zoomLabel");
const rotationSlider = document.querySelector("#rotationSlider");
const rotationLabel = document.querySelector("#rotationLabel");
const resetGuideButton = document.querySelector("#resetGuideButton");
const cameraZoomControl = document.querySelector("#cameraZoomControl");
const cameraZoomSlider = document.querySelector("#cameraZoomSlider");
const cameraZoomLabel = document.querySelector("#cameraZoomLabel");
const gridButton = document.querySelector("#gridButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const switchCameraButton = document.querySelector("#switchCameraButton");
const captureButton = document.querySelector("#captureButton");
const canvas = document.querySelector("#captureCanvas");
const resultImage = document.querySelector("#resultImage");
const saveLink = document.querySelector("#saveLink");
const retakeButton = document.querySelector("#retakeButton");
const backButton = document.querySelector("#backButton");

let stream = null;
let facingMode = "user";
let guideObjectUrl = null;
let resultObjectUrl = null;
let guideTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
let dragState = null;
let gestureState = null;
let didMoveGuide = false;
let touchState = null;
const activePointers = new Map();

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("is-error", isError);
}

function updateEmptyState() {
  const hasCamera = Boolean(stream);
  const hasGuide = Boolean(overlay.src) && !overlay.hidden;
  emptyState.hidden = hasCamera && hasGuide;
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function startCamera() {
  if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
    setMessage("Browser non compatibile: serve un browser moderno con getUserMedia().", true);
    updateEmptyState();
    return;
  }

  stopCamera();
  setMessage("Apro la fotocamera...");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    video.srcObject = stream;
    video.classList.toggle("is-front", facingMode === "user");
    await video.play();
    await enableContinuousFocus();
    setupCameraZoom();
    setMessage("Fotocamera pronta. Scegli una foto guida.");
  } catch (error) {
    stopCamera();
    const insecure = location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
    const reason = insecure
      ? "La fotocamera richiede HTTPS oppure localhost."
      : "Permesso negato o fotocamera non disponibile.";
    setMessage(`${reason} Dettaglio: ${error.message || error.name}`, true);
  } finally {
    updateEmptyState();
  }
}

function setupCameraZoom() {
  cameraZoomControl.hidden = true;
  const [track] = stream.getVideoTracks();
  if (!track || !track.getCapabilities) return;

  const capabilities = track.getCapabilities();
  if (!capabilities.zoom) return;

  const settings = track.getSettings ? track.getSettings() : {};
  const min = capabilities.zoom.min || 1;
  const max = capabilities.zoom.max || 1;
  const step = capabilities.zoom.step || 0.1;
  const value = clamp(settings.zoom || min, min, max);

  cameraZoomSlider.min = String(min);
  cameraZoomSlider.max = String(max);
  cameraZoomSlider.step = String(step);
  cameraZoomSlider.value = String(value);
  cameraZoomLabel.textContent = `Zoom camera: ${Number(value).toFixed(1)}x`;
  cameraZoomControl.hidden = false;
}

async function applyCameraZoom() {
  const [track] = stream ? stream.getVideoTracks() : [];
  if (!track || !track.applyConstraints) return;

  const zoom = Number(cameraZoomSlider.value);
  cameraZoomLabel.textContent = `Zoom camera: ${zoom.toFixed(1)}x`;

  try {
    await track.applyConstraints({ advanced: [{ zoom }] });
  } catch (error) {
    setMessage(`Zoom camera non disponibile su questo dispositivo: ${error.message || error.name}`, true);
  }
}

async function enableContinuousFocus() {
  const [track] = stream.getVideoTracks();
  if (!track || !track.getCapabilities) return;

  const capabilities = track.getCapabilities();
  if (!capabilities.focusMode || !capabilities.focusMode.includes("continuous")) return;

  try {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
  } catch {
  }
}

function revokeGuideUrl() {
  if (guideObjectUrl) {
    URL.revokeObjectURL(guideObjectUrl);
    guideObjectUrl = null;
  }
}

function setGuide(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    setMessage("File immagine non valido. Scegli JPG, PNG o WEBP se supportato.", true);
    return;
  }

  revokeGuideUrl();
  guideObjectUrl = URL.createObjectURL(file);
  overlay.src = guideObjectUrl;
  overlay.hidden = false;
  cameraStage.classList.add("is-guide-active");
  changeGuideButton.hidden = false;
  removeGuideButton.hidden = false;
  resetGuideButton.hidden = false;
  loadGuideButton.textContent = "Carica foto guida";
  resetGuideTransform();
  setMessage("Foto guida caricata. Trascina nell'area camera, usa due dita o gli slider per allinearla.");
  updateEmptyState();
}

function removeGuide() {
  revokeGuideUrl();
  overlay.removeAttribute("src");
  overlay.hidden = true;
  cameraStage.classList.remove("is-guide-active", "is-dragging");
  guideInput.value = "";
  changeGuideButton.hidden = true;
  removeGuideButton.hidden = true;
  resetGuideButton.hidden = true;
  resetGuideTransform();
  setMessage("Foto guida rimossa.");
  updateEmptyState();
}

function updateOpacity() {
  const value = Number(opacitySlider.value);
  overlay.style.opacity = String(value / 100);
  opacityLabel.textContent = `Opacità foto guida: ${value}%`;
}

function updateGuideTransform() {
  overlay.style.transform = `translate(${guideTransform.x}px, ${guideTransform.y}px) scale(${guideTransform.scale}) rotate(${guideTransform.rotation}deg)`;
  zoomSlider.value = String(Math.round(guideTransform.scale * 100));
  rotationSlider.value = String(Math.round(guideTransform.rotation));
  zoomLabel.textContent = `Dimensione foto guida: ${zoomSlider.value}%`;
  rotationLabel.textContent = `Rotazione foto guida: ${rotationSlider.value}°`;
}

function resetGuideTransform() {
  guideTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
  updateGuideTransform();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointerDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerAngle(first, second) {
  return Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;
}

function pointerCenter(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  };
}

function beginGesture() {
  const pointers = Array.from(activePointers.values()).slice(0, 2);
  const center = pointerCenter(pointers[0], pointers[1]);
  gestureState = {
    distance: pointerDistance(pointers[0], pointers[1]),
    angle: pointerAngle(pointers[0], pointers[1]),
    centerX: center.x,
    centerY: center.y,
    originX: guideTransform.x,
    originY: guideTransform.y,
    originScale: guideTransform.scale,
    originRotation: guideTransform.rotation
  };
}

function touchPoints(touches) {
  return Array.from(touches).map((touch) => ({ x: touch.clientX, y: touch.clientY }));
}

function beginTouchGesture(touches) {
  const points = touchPoints(touches);
  didMoveGuide = false;

  if (points.length === 1) {
    touchState = {
      mode: "drag",
      startX: points[0].x,
      startY: points[0].y,
      originX: guideTransform.x,
      originY: guideTransform.y
    };
    return;
  }

  const center = pointerCenter(points[0], points[1]);
  touchState = {
    mode: "gesture",
    distance: pointerDistance(points[0], points[1]),
    angle: pointerAngle(points[0], points[1]),
    centerX: center.x,
    centerY: center.y,
    originX: guideTransform.x,
    originY: guideTransform.y,
    originScale: guideTransform.scale,
    originRotation: guideTransform.rotation
  };
}

function moveTouchGesture(touches) {
  if (!touchState) return;
  const points = touchPoints(touches);

  if (touchState.mode === "drag" && points.length === 1) {
    guideTransform.x = touchState.originX + points[0].x - touchState.startX;
    guideTransform.y = touchState.originY + points[0].y - touchState.startY;
    didMoveGuide = Math.hypot(points[0].x - touchState.startX, points[0].y - touchState.startY) > 4;
    updateGuideTransform();
    return;
  }

  if (points.length >= 2) {
    if (touchState.mode !== "gesture") {
      beginTouchGesture(touches);
      return;
    }

    const center = pointerCenter(points[0], points[1]);
    const nextDistance = pointerDistance(points[0], points[1]);
    const nextAngle = pointerAngle(points[0], points[1]);

    guideTransform.x = touchState.originX + center.x - touchState.centerX;
    guideTransform.y = touchState.originY + center.y - touchState.centerY;
    guideTransform.scale = clamp(touchState.originScale * (nextDistance / Math.max(touchState.distance, 1)), 0.4, 2.6);
    guideTransform.rotation = clamp(touchState.originRotation + nextAngle - touchState.angle, -180, 180);
    didMoveGuide = true;
    updateGuideTransform();
  }
}

function timestampFileName() {
  const pad = (number) => String(number).padStart(2, "0");
  const now = new Date();
  return [
    "foto-posa",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`;
}

function showResult(blob) {
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
  resultObjectUrl = URL.createObjectURL(blob);
  resultImage.src = resultObjectUrl;
  saveLink.href = resultObjectUrl;
  saveLink.download = timestampFileName();
  cameraView.classList.remove("is-active");
  resultView.classList.add("is-active");
}

function capturePhoto() {
  try {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!stream || !width || !height) {
      setMessage("La fotocamera non e pronta per lo scatto.", true);
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });

    context.save();
    if (facingMode === "user") {
      context.translate(width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, width, height);
    context.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage("Errore durante la creazione della foto.", true);
          return;
        }
        showResult(blob);
      },
      "image/jpeg",
      0.95
    );
  } catch (error) {
    setMessage(`Errore durante lo scatto: ${error.message || error.name}`, true);
  }
}

function returnToCamera() {
  resultView.classList.remove("is-active");
  cameraView.classList.add("is-active");
}

function showFocusRing(clientX, clientY) {
  const rect = cameraStage.getBoundingClientRect();
  focusRing.style.left = `${clientX - rect.left}px`;
  focusRing.style.top = `${clientY - rect.top}px`;
  focusRing.hidden = false;
  focusRing.classList.remove("is-visible");
  requestAnimationFrame(() => focusRing.classList.add("is-visible"));
}

async function focusCameraAt(clientX, clientY) {
  const [track] = stream ? stream.getVideoTracks() : [];
  if (!track || !track.applyConstraints || !track.getCapabilities) return;

  const capabilities = track.getCapabilities();
  const rect = cameraStage.getBoundingClientRect();
  const point = {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1)
  };

  const focusMode = capabilities.focusMode && capabilities.focusMode.includes("single-shot")
    ? "single-shot"
    : undefined;

  try {
    await track.applyConstraints({
      advanced: [{
        ...(focusMode ? { focusMode } : {}),
        pointsOfInterest: [point]
      }]
    });
  } catch {
  }
}

focusRing.addEventListener("animationend", () => {
  focusRing.hidden = true;
  focusRing.classList.remove("is-visible");
});

function openGuidePicker() {
  guideInput.value = "";
  guideInput.click();
}

loadGuideButton.addEventListener("click", openGuidePicker);
changeGuideButton.addEventListener("click", openGuidePicker);
removeGuideButton.addEventListener("click", removeGuide);

guideInput.addEventListener("change", () => {
  const [file] = guideInput.files;
  setGuide(file);
});

opacitySlider.addEventListener("input", updateOpacity);
zoomSlider.addEventListener("input", () => {
  guideTransform.scale = Number(zoomSlider.value) / 100;
  updateGuideTransform();
});

rotationSlider.addEventListener("input", () => {
  guideTransform.rotation = Number(rotationSlider.value);
  updateGuideTransform();
});

resetGuideButton.addEventListener("click", resetGuideTransform);
cameraZoomSlider.addEventListener("input", applyCameraZoom);
gridButton.addEventListener("click", () => {
  gridOverlay.hidden = !gridOverlay.hidden;
  gridButton.classList.toggle("is-active", !gridOverlay.hidden);
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement && cameraView.requestFullscreen) {
      await cameraView.requestFullscreen();
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (error) {
    setMessage(`Schermo intero non disponibile: ${error.message || error.name}`, true);
  }
});

function endGuidePointer(event) {
  if (event.pointerType === "touch") return;
  activePointers.delete(event.pointerId);

  if (activePointers.size < 2) {
    gestureState = null;
  }

  if (activePointers.size === 1) {
    const [remainingPointerId, remainingPointer] = Array.from(activePointers.entries())[0];
    dragState = {
      pointerId: remainingPointerId,
      startX: remainingPointer.x,
      startY: remainingPointer.y,
      originX: guideTransform.x,
      originY: guideTransform.y
    };
    return;
  }

  cameraStage.classList.remove("is-dragging");
  dragState = null;
}

cameraStage.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") return;
  if (overlay.hidden) return;
  event.preventDefault();
  cameraStage.setPointerCapture(event.pointerId);
  cameraStage.classList.add("is-dragging");
  didMoveGuide = false;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size === 1) {
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: guideTransform.x,
      originY: guideTransform.y
    };
  }

  if (activePointers.size === 2) {
    dragState = null;
    beginGesture();
  }
});

cameraStage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  if (!activePointers.has(event.pointerId)) return;
  event.preventDefault();
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (gestureState && activePointers.size >= 2) {
    const pointers = Array.from(activePointers.values()).slice(0, 2);
    const center = pointerCenter(pointers[0], pointers[1]);
    const nextDistance = pointerDistance(pointers[0], pointers[1]);
    const nextAngle = pointerAngle(pointers[0], pointers[1]);

    guideTransform.x = gestureState.originX + center.x - gestureState.centerX;
    guideTransform.y = gestureState.originY + center.y - gestureState.centerY;
    guideTransform.scale = clamp(gestureState.originScale * (nextDistance / Math.max(gestureState.distance, 1)), 0.4, 2.6);
    guideTransform.rotation = clamp(gestureState.originRotation + nextAngle - gestureState.angle, -180, 180);
    didMoveGuide = true;
    updateGuideTransform();
    return;
  }

  if (!dragState || dragState.pointerId !== event.pointerId) return;
  guideTransform.x = dragState.originX + event.clientX - dragState.startX;
  guideTransform.y = dragState.originY + event.clientY - dragState.startY;
  if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) {
    didMoveGuide = true;
  }
  updateGuideTransform();
});

cameraStage.addEventListener("pointerup", endGuidePointer);
cameraStage.addEventListener("pointercancel", (event) => {
  if (event.pointerType === "touch") return;
  activePointers.delete(event.pointerId);
  cameraStage.classList.remove("is-dragging");
  activePointers.clear();
  dragState = null;
  gestureState = null;
});

cameraStage.addEventListener("touchstart", (event) => {
  if (overlay.hidden) return;
  event.preventDefault();
  cameraStage.classList.add("is-dragging");
  beginTouchGesture(event.touches);
}, { passive: false });

cameraStage.addEventListener("touchmove", (event) => {
  if (overlay.hidden || !touchState) return;
  event.preventDefault();
  moveTouchGesture(event.touches);
}, { passive: false });

cameraStage.addEventListener("touchend", (event) => {
  if (event.touches.length > 0) {
    beginTouchGesture(event.touches);
    return;
  }

  cameraStage.classList.remove("is-dragging");
  touchState = null;
});

cameraStage.addEventListener("touchcancel", () => {
  cameraStage.classList.remove("is-dragging");
  touchState = null;
});

cameraStage.addEventListener("click", (event) => {
  if (didMoveGuide) return;
  showFocusRing(event.clientX, event.clientY);
  focusCameraAt(event.clientX, event.clientY);
});

switchCameraButton.addEventListener("click", async () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  await startCamera();
});

captureButton.addEventListener("click", capturePhoto);
retakeButton.addEventListener("click", returnToCamera);
backButton.addEventListener("click", returnToCamera);

window.addEventListener("pagehide", () => {
  stopCamera();
  revokeGuideUrl();
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
});

updateOpacity();
updateGuideTransform();
startCamera();
