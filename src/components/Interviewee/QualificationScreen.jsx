import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Button, Space, Alert, Spin, Checkbox } from 'antd';
import {
  CheckCircleOutlined,
  CameraOutlined,
  TrophyOutlined,
  RightOutlined
} from '@ant-design/icons';
import './QualificationScreen.css';

const QualificationScreen = ({ candidateName, onProceedToInterview }) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [personDetected, setPersonDetected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualVerification, setManualVerification] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const previousFrameRef = useRef(null);
  const detectionCountRef = useRef(0);
  const personDetectedRef = useRef(false);

  // Improved skin tone detection
  const detectSkinTone = (r, g, b) => {
    // More lenient skin tone detection
    const isReddish = r > 60 && g > 40 && b > 20;
    const isNotTooGreen = r > g;
    const isNotTooBlue = g > b;
    const hasContrast = Math.max(r, g, b) - Math.min(r, g, b) > 10;

    return isReddish && isNotTooGreen && isNotTooBlue && hasContrast;
  };

  // Detect edges in the frame
  const detectEdges = (frameData, width, height) => {
    let edgePixels = 0;
    const stride = width * 4;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        // Get current pixel luminance
        const current = frameData[idx] * 0.299 + frameData[idx + 1] * 0.587 + frameData[idx + 2] * 0.114;

        // Get neighboring pixel luminance
        const right = frameData[idx + 4] * 0.299 + frameData[idx + 5] * 0.587 + frameData[idx + 6] * 0.114;
        const bottom = frameData[idx + stride] * 0.299 + frameData[idx + stride + 1] * 0.587 + frameData[idx + stride + 2] * 0.114;

        // Calculate edge strength
        const edgeStrength = Math.abs(current - right) + Math.abs(current - bottom);

        if (edgeStrength > 30) {
          edgePixels++;
        }
      }
    }

    return edgePixels / ((width - 2) * (height - 2));
  };

  // Calculate frame difference for motion detection
  const calculateFrameDifference = (currentFrame, previousFrame) => {
    let diff = 0;
    let count = 0;

    for (let i = 0; i < currentFrame.length; i += 4) {
      const rDiff = Math.abs(currentFrame[i] - previousFrame[i]);
      const gDiff = Math.abs(currentFrame[i + 1] - previousFrame[i + 1]);
      const bDiff = Math.abs(currentFrame[i + 2] - previousFrame[i + 2]);

      const pixelDiff = (rDiff + gDiff + bDiff) / 3;
      if (pixelDiff > 5) {
        diff += pixelDiff;
        count++;
      }
    }

    return count > 0 ? diff / count : 0;
  };

  // Main face detection function
  const detectFacePresence = (frameData, width, height) => {
    const length = frameData.length;
    let skinPixels = 0;
    let brightPixels = 0;
    let darkPixels = 0;
    let totalPixels = 0;

    // Analyze frame
    for (let i = 0; i < length; i += 4) {
      const r = frameData[i];
      const g = frameData[i + 1];
      const b = frameData[i + 2];

      totalPixels++;

      // Calculate luminance
      const luminance = r * 0.299 + g * 0.587 + b * 0.114;

      // Count bright pixels (face is usually well-lit)
      if (luminance > 60 && luminance < 220) {
        brightPixels++;
      }

      // Count dark pixels (shadows, features)
      if (luminance < 100) {
        darkPixels++;
      }

      // Detect skin tone
      if (detectSkinTone(r, g, b)) {
        skinPixels++;
      }
    }

    // Calculate ratios
    const skinRatio = totalPixels > 0 ? skinPixels / totalPixels : 0;
    const brightRatio = totalPixels > 0 ? brightPixels / totalPixels : 0;
    const darkRatio = totalPixels > 0 ? darkPixels / totalPixels : 0;

    // Detect edges
    const edgeRatio = detectEdges(frameData, width, height);

    // Face detection criteria (more lenient)
    const hasFace = 
      skinRatio > 0.02 &&      // At least 2% skin tone pixels
      brightRatio > 0.2 &&     // At least 20% bright pixels
      darkRatio > 0.1 &&       // At least 10% dark pixels (features)
      edgeRatio > 0.05;        // At least 5% edge pixels

    return {
      hasFace,
      skinRatio: (skinRatio * 100).toFixed(2),
      brightRatio: (brightRatio * 100).toFixed(2),
      darkRatio: (darkRatio * 100).toFixed(2),
      edgeRatio: (edgeRatio * 100).toFixed(2)
    };
  };

  // Stop face detection
  const stopFaceDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    previousFrameRef.current = null;
    detectionCountRef.current = 0;
    personDetectedRef.current = false;
  }, []);

  // Start face detection
  const startFaceDetection = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    console.log('Starting face detection...');

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const video = videoRef.current;

    canvas.width = 320;
    canvas.height = 240;

    detectionIntervalRef.current = setInterval(() => {
      if (!video || video.readyState !== 4) return;

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const currentFrame = imageData.data;

        // Detect face
        const faceDetection = detectFacePresence(currentFrame, canvas.width, canvas.height);

        // Check for motion if we have a previous frame
        let hasMotion = false;
        if (previousFrameRef.current) {
          const frameDiff = calculateFrameDifference(currentFrame, previousFrameRef.current);
          hasMotion = frameDiff > 8; // Motion threshold
        }

        // Store current frame for next comparison
        previousFrameRef.current = new Uint8ClampedArray(currentFrame);

        // Update debug info
        setDebugInfo(
          `Skin: ${faceDetection.skinRatio}% | Bright: ${faceDetection.brightRatio}% | Dark: ${faceDetection.darkRatio}% | Edge: ${faceDetection.edgeRatio}% | Motion: ${hasMotion ? 'Yes' : 'No'}`
        );

        // Detect person: face detected + motion (or first frame)
        const personPresent = faceDetection.hasFace && (hasMotion || !previousFrameRef.current);

        if (personPresent) {
          detectionCountRef.current += 1;
          console.log(`Detection count: ${detectionCountRef.current}`);

          // Require 2 consecutive detections to confirm
          if (detectionCountRef.current >= 2 && !personDetectedRef.current) {
            console.log('✓ Face detected! Enabling button...');
            personDetectedRef.current = true;
            setPersonDetected(true);
          }
        } else {
          detectionCountRef.current = Math.max(0, detectionCountRef.current - 1);

          if (personDetectedRef.current && detectionCountRef.current === 0) {
            console.log('Face no longer detected');
            personDetectedRef.current = false;
            setPersonDetected(false);
          }
        }

      } catch (error) {
        console.error('Face detection error:', error);
      }
    }, 250); // Check every 250ms for faster detection
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    stopFaceDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, [stopFaceDetection]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setLoading(true);

      const constraints = {
        video: {
          width: { ideal: 640, min: 320 },
          height: { ideal: 480, min: 240 },
          facingMode: 'user'
        },
        audio: false,
      };

      console.log('Requesting camera access...');

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstError) {
        console.log('Primary camera constraints failed, trying fallback...', firstError);
        try {
          const fallbackConstraints = {
            video: {
              width: { ideal: 640, min: 320 },
              height: { ideal: 480, min: 240 }
            },
            audio: false,
          };
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          console.log('Fallback camera access successful');
        } catch (fallbackError) {
          console.error('Fallback camera also failed:', fallbackError);
          throw firstError;
        }
      }

      console.log('Camera stream obtained:', stream);

      if (videoRef.current) {
        console.log('Setting video srcObject...');
        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded, attempting to play...');
          videoRef.current.play().then(() => {
            console.log('Video playing successfully');
            startFaceDetection();
          }).catch(err => {
            console.error('Video play error:', err);
          });
        };

        videoRef.current.style.width = '100%';
        videoRef.current.style.height = '100%';
        videoRef.current.style.objectFit = 'cover';

        streamRef.current = stream;
        setCameraActive(true);
        setCameraError(null);

        console.log('Camera started successfully');
      }
    } catch (error) {
      console.error('Camera access error:', error);

      let errorMessage = 'Unable to access camera. ';

      if (error.name === 'NotAllowedError') {
        errorMessage += 'Camera permission denied. Please allow camera access in browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera found on your device.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage += 'Camera constraints not supported by your device.';
      } else if (error.name === 'TypeError') {
        errorMessage += 'getUserMedia is not supported in your browser.';
      } else {
        errorMessage += 'Please check your camera and try again.';
      }

      setCameraError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [startFaceDetection]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleProceed = () => {
    stopCamera();
    onProceedToInterview();
  };

  const canProceed = personDetected || manualVerification;

  return (
    <div className="qualification-screen-container">
      <div className="qualification-content">
        {/* Success Banner */}
        <div className="success-banner">
          <div className="success-icon-wrapper">
            <CheckCircleOutlined className="success-icon" />
          </div>
          <h1 className="success-title">Congratulations, {candidateName}!</h1>
          <p className="success-subtitle">
            You have successfully qualified for the AI-Powered Interview Round
          </p>
        </div>

        {/* Main Content Card */}
        <Card className="qualification-card">
          <div className="card-content">
            {/* Left Section - Camera */}
            <div className="camera-section">
              <div className="camera-header">
                <CameraOutlined className="camera-icon" />
                <h3>Identity Verification</h3>
              </div>
              
              <div className="camera-container">
                {loading ? (
                  <div className="camera-loading">
                    <Spin size="large" tip="Initializing camera..." />
                  </div>
                ) : cameraError ? (
                  <Alert
                    message="Camera Error"
                    description={cameraError}
                    type="error"
                    showIcon
                    action={
                      <Button size="small" onClick={startCamera}>
                        Retry
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="camera-feed"
                      onCanPlay={() => console.log('Video can play')}
                      onPlay={() => console.log('Video started playing')}
                      onError={(e) => console.error('Video error:', e)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <canvas
                      ref={canvasRef}
                      style={{ display: 'none' }}
                    />
                    {cameraActive && (
                      <div className={`detection-overlay ${personDetected ? 'detected' : ''}`}>
                        <div className="detection-frame" />
                        {personDetected && (
                          <div className="detection-badge" style={{
                            backgroundColor: '#52c41a',
                            color: 'white',
                            padding: '10px 20px',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            animation: 'pulse 1s infinite'
                          }}>
                            <CheckCircleOutlined /> Your Face Detected ✓
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Debug Info */}
              {cameraActive && debugInfo && (
                <div style={{ 
                  fontSize: '10px', 
                  color: '#666', 
                  marginTop: '8px', 
                  padding: '8px', 
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  lineHeight: '1.4'
                }}>
                  {debugInfo}
                </div>
              )}

              {personDetected && (
                <Alert
                  message="✓ Verification Successful"
                  description="Your face has been detected and verified. The 'Start Interview' button is now enabled!"
                  type="success"
                  showIcon
                  className="verification-alert"
                  style={{ marginTop: '10px' }}
                />
              )}

              {!personDetected && cameraActive && !cameraError && (
                <Alert
                  message="Detecting Face..."
                  description="Please ensure your face is clearly visible in the camera with good lighting. Move slightly if needed."
                  type="info"
                  showIcon
                  className="verification-alert"
                  style={{ marginTop: '10px' }}
                />
              )}

              {/* Manual Verification Fallback */}
              {cameraActive && !personDetected && (
                <div className="manual-verification-section" style={{ marginTop: '10px' }}>
                  <p className="manual-verification-text" style={{ fontSize: '12px', marginBottom: '8px' }}>
                    If the automatic detection is not working, you can manually verify:
                  </p>
                  <Checkbox 
                    checked={manualVerification}
                    onChange={(e) => setManualVerification(e.target.checked)}
                  >
                    I confirm that I am the person in the camera and ready to proceed
                  </Checkbox>
                </div>
              )}
            </div>

            {/* Right Section - Interview Details */}
            <div className="details-section">
              <div className="trophy-icon-wrapper">
                <TrophyOutlined className="trophy-icon" />
              </div>
              
              <h2 className="details-title">Round 2: AI Interview</h2>
              
              <div className="interview-stats">
                <div className="stat-card">
                  <div className="stat-number">6</div>
                  <div className="stat-label">Questions</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">~10</div>
                  <div className="stat-label">Minutes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">100</div>
                  <div className="stat-label">Max Score</div>
                </div>
              </div>

              <div className="difficulty-breakdown">
                <h4>Question Difficulty</h4>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div className="difficulty-item">
                    <span className="difficulty-label">
                      <span className="dot easy-dot"></span>
                      Easy (2 questions)
                    </span>
                    <span className="time-badge">20s each</span>
                  </div>
                  <div className="difficulty-item">
                    <span className="difficulty-label">
                      <span className="dot medium-dot"></span>
                      Medium (2 questions)
                    </span>
                    <span className="time-badge">60s each</span>
                  </div>
                  <div className="difficulty-item">
                    <span className="difficulty-label">
                      <span className="dot hard-dot"></span>
                      Hard (2 questions)
                    </span>
                    <span className="time-badge">120s each</span>
                  </div>
                </Space>
              </div>

              <div className="instructions">
                <h4>Instructions</h4>
                <ul>
                  <li>Answer all questions within the time limit</li>
                  <li>Questions will be presented one at a time</li>
                  <li>Your camera will remain active during the interview</li>
                  <li>You can pause the interview if needed</li>
                </ul>
              </div>

              <Button
                type="primary"
                size="large"
                block
                icon={<RightOutlined />}
                onClick={handleProceed}
                disabled={!canProceed}
                className="proceed-button"
                style={{
                  backgroundColor: canProceed ? '#1890ff' : '#d9d9d9',
                  borderColor: canProceed ? '#1890ff' : '#d9d9d9',
                  cursor: canProceed ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease'
                }}
              >
                {canProceed ? '✓ Start Interview' : 'Waiting for Face Detection...'}
              </Button>

              {canProceed && (
                <p style={{ textAlign: 'center', marginTop: '10px', color: '#52c41a', fontSize: '12px', fontWeight: 'bold' }}>
                  ✓ You are ready to proceed
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Progress Indicator */}
        <div className="progress-indicator">
          <div className="progress-step completed">
            <div className="step-circle">✓</div>
            <span>Resume Upload</span>
          </div>
          <div className="progress-line completed"></div>
          <div className="progress-step active">
            <div className="step-circle">2</div>
            <span>Verification</span>
          </div>
          <div className="progress-line"></div>
          <div className="progress-step">
            <div className="step-circle">3</div>
            <span>Interview</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QualificationScreen;