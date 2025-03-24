import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { CODE_GENERATION_PROMPT } from './prompts';

function App() {
  const [code, setCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const iframeRef = useRef(null);
  const pauseTimeoutRef = useRef(null);
  const finalTranscriptRef = useRef('');

  // Initialize speech recognition
  useEffect(() => {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        const currentTranscript = result[0].transcript;
        const isFinal = result.isFinal;
        
        console.log('Speech result:', currentTranscript, isFinal ? '(final)' : '(interim)');
        setTranscript(currentTranscript);

        // Set up pause detection timeout
        if (isFinal) {
          console.log('Speech result:', currentTranscript, '(final)');
          setTranscript(currentTranscript);
          finalTranscriptRef.current = currentTranscript;
          
          // Clear any existing timeout
          if (pauseTimeoutRef.current) {
            console.log('Clearing existing pause timeout');
            clearTimeout(pauseTimeoutRef.current);
          }
          
          // Set new timeout
          console.log('Setting new pause timeout');
          pauseTimeoutRef.current = setTimeout(() => {
            console.log('Speech paused for 2 seconds');
            if (finalTranscriptRef.current) {
              console.log('Generating code with transcript:', finalTranscriptRef.current);
              // Stop speech recognition before starting code generation
              if (recognitionRef.current) {
                console.log('Stopping speech recognition before code generation');
                recognitionRef.current.stop();
                setIsListening(false);
              }
              // Ensure we call handleGenerateCode even if speech recognition is already stopped
              setTimeout(() => {
                console.log('Calling handleGenerateCode');
                handleGenerateCode(finalTranscriptRef.current);
              }, 100);
            } else {
              console.log('No transcript available for code generation');
            }
          }, 2000);
        } else {
          console.log('Speech result:', currentTranscript, '(interim)');
          setTranscript(currentTranscript);
        }
      };

      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
        if (pauseTimeoutRef.current) {
          clearTimeout(pauseTimeoutRef.current);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (pauseTimeoutRef.current) {
          clearTimeout(pauseTimeoutRef.current);
        }
      };

      recognitionRef.current.onnomatch = () => {
        console.log('No speech was recognized');
      };

      recognitionRef.current.onspeechstart = () => {
        console.log('Speech started');
      };
    }

    // Cleanup function
    return () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, []);

  // Start and stop voice recognition
  const handleStart = () => {
    console.log('Starting speech recognition...');
    setTranscript('');
    finalTranscriptRef.current = '';
    setError(null); // Clear any previous errors
    setIsListening(true);
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
  };

  const handleStop = () => {
    console.log('Manually stopping speech recognition...');
    setIsListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
    }
    
    // Add a small delay to ensure transcript is updated
    setTimeout(() => {
      if (finalTranscriptRef.current) {
        console.log('Triggering code generation after manual stop...');
        handleGenerateCode(finalTranscriptRef.current);
      }
    }, 100);
  };

  // Function to send the transcript to OpenAI and generate code
  const handleGenerateCode = async (transcriptToUse) => {
    if (!transcriptToUse) {
      console.log('No transcript available for code generation');
      return;
    }
    console.log('Starting code generation with transcript:', transcriptToUse);
    setIsGenerating(true);
    setError(null); // Clear any previous errors
    try {
      const prompt = CODE_GENERATION_PROMPT.replace('{transcript}', transcriptToUse);
      console.log('Sending request to OpenAI...');
      const response = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: "o3-mini",
          input: prompt,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
          },
        }
      );
      console.log('Received response from OpenAI');
      window.res = response;
      
      // Log the full response structure
      console.log('Full response:', response.data);
      
      // Extract the generated code
      const generatedCode = response.data.output[1].content[0].text;
      console.log('Generated code:', generatedCode);
      
      // Trim markdown code block markers if they exist
      const trimmedCode = generatedCode.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
      console.log('Trimmed code:', trimmedCode);
      
      setCode(trimmedCode);
      
      // Create a complete HTML document with the generated code
      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Generated App</title>
            <style>
              body {
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
              }
            </style>
          </head>
          <body>
            ${trimmedCode}
          </body>
        </html>
      `;
      
      // Create blob and URL
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      console.log('Created URL for iframe:', url);
      
      // Set the iframe source with a small delay to ensure it's mounted
      setTimeout(() => {
        if (iframeRef.current) {
          console.log('Setting iframe source...');
          iframeRef.current.src = url;
        } else {
          console.error('iframe ref is not available, retrying...');
          // Try one more time after a longer delay
          setTimeout(() => {
            if (iframeRef.current) {
              console.log('Setting iframe source on retry...');
              iframeRef.current.src = url;
            } else {
              console.error('iframe ref still not available after retry');
              setError('Failed to load the generated application. Please try again.');
            }
          }, 500);
        }
      }, 100);
    } catch (error) {
      console.error('Error generating code:', error);
      setError(error.response?.data?.error?.message || 'Failed to generate code. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Add iframe load handler
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.onload = () => {
        console.log('iframe loaded successfully');
      };
      iframeRef.current.onerror = (error) => {
        console.error('iframe failed to load:', error);
        setError('Failed to load the generated application');
      };
    }
  }, []);

  // Add a ref to track if the component is mounted
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Voice-Controlled Web App Generator</h1>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={handleStart} disabled={isListening || isGenerating}>
          {isListening ? 'Listening...' : 'Start Voice Input'}
        </button>
        <button onClick={handleStop} style={{ marginLeft: '10px' }} disabled={!isListening || isGenerating}>
          Stop Voice Input
        </button>
      </div>
      <div>
        <strong>Transcript:</strong> {transcript}
      </div>
      {error && (
        <div style={{ 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: '#ffebee', 
          color: '#c62828',
          borderRadius: '4px',
          border: '1px solid #ef9a9a'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      <div style={{ marginTop: '20px' }}>
        {isGenerating ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '500px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #3498db',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 10px'
              }}></div>
              <div>Generating code...</div>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            title="Generated App"
            style={{ 
              width: '100%', 
              height: '500px', 
              border: '1px solid #ccc',
              backgroundColor: '#fff',
              display: 'block' // Ensure the iframe is displayed
            }}
          />
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default App;
