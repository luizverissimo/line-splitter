import { formatDuration } from '@line-splitter/shared';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useRef, useState } from 'react';

interface Props {
  /** URL `media://audio/<token>` fornecida pelo processo principal. */
  src: string;
  /** Nome da faixa, usado nos rótulos acessíveis. */
  title: string;
}

/** Player com play/pause, barra de posição arrastável, tempo atual/total e volume. */
export function AudioPlayer(props: Props) {
  // Trocar de faixa recria o player: posição, duração e erro voltam ao estado inicial.
  return <Player key={props.src} {...props} />;
}

function Player({ src, title }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Enquanto o usuário arrasta a barra, o timeupdate não pode mover o controle.
  const seekingRef = useRef(false);
  // Último volume audível, restaurado ao reativar o som depois de zerar pelo controle.
  const lastAudibleRef = useRef(1);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch (err) {
        setError(err instanceof Error ? `Não foi possível tocar: ${err.message}` : 'Não foi possível tocar.');
      }
    } else {
      audio.pause();
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  const changeVolume = (value: number) => {
    const audio = audioRef.current;
    setVolume(value);
    setMuted(value === 0);
    if (value > 0) lastAudibleRef.current = value;
    if (audio) {
      audio.volume = value;
      audio.muted = value === 0;
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    const next = !muted;
    setMuted(next);
    if (!next && volume === 0) {
      setVolume(lastAudibleRef.current);
      if (audio) audio.volume = lastAudibleRef.current;
    }
    if (audio) audio.muted = next;
  };

  const ready = duration !== null && Number.isFinite(duration);

  return (
    <div className="audio-player" aria-label={`Player: ${title}`} role="group">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          if (!seekingRef.current) setCurrent(e.currentTarget.currentTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() =>
          setError('Não foi possível carregar o áudio. O arquivo pode ter sido movido ou apagado.')
        }
      />
      <button
        type="button"
        className="icon-button"
        onClick={() => void toggle()}
        disabled={!ready || error !== null}
        aria-label={playing ? `Pausar ${title}` : `Tocar ${title}`}
      >
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
      <span className="audio-time" aria-hidden="true">
        {formatDuration(current)}
      </span>
      <input
        type="range"
        className="audio-seek"
        min={0}
        max={ready ? duration : 0}
        step={0.1}
        value={current}
        disabled={!ready || error !== null}
        onChange={(e) => seek(Number(e.currentTarget.value))}
        onPointerDown={() => {
          seekingRef.current = true;
        }}
        onPointerUp={() => {
          seekingRef.current = false;
        }}
        onPointerCancel={() => {
          seekingRef.current = false;
        }}
        onBlur={() => {
          seekingRef.current = false;
        }}
        aria-label={`Posição em ${title}`}
        aria-valuetext={`${formatDuration(current)} de ${ready ? formatDuration(duration) : '--:--'}`}
      />
      <span className="audio-time">{ready ? formatDuration(duration) : '--:--'}</span>
      <button
        type="button"
        className="icon-button"
        onClick={toggleMute}
        aria-label={muted ? `Ativar som de ${title}` : `Silenciar ${title}`}
        aria-pressed={muted}
      >
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>
      <input
        type="range"
        className="audio-volume"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => changeVolume(Number(e.currentTarget.value))}
        aria-label={`Volume de ${title}`}
      />
      {error && (
        <p className="audio-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
