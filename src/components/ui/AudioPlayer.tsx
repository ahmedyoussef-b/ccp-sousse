'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

interface AudioPlayerProps {
  src?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
}

export default function AudioPlayer({ src, autoPlay = false, onEnded }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (src && audioRef.current) {
      audioRef.current.src = src;
      if (autoPlay) {
        audioRef.current.play().catch(console.error);
      }
    }
  }, [src, autoPlay]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-2 rounded-xl">
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        className="hidden"
      />
      
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={togglePlay}
        className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-white/10"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>

      <div className="flex items-center gap-2 flex-1">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleMute}
          className="h-6 w-6 text-gray-400"
        >
          {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </Button>
        <Slider
          value={[isMuted ? 0 : volume]}
          max={1}
          step={0.1}
          onValueChange={(vals) => {
            setVolume(vals[0]);
            if (audioRef.current) audioRef.current.volume = vals[0];
            setIsMuted(vals[0] === 0);
          }}
          className="w-20"
        />
      </div>
    </div>
  );
}
