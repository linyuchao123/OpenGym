"""Reproducible original instrumentals, synthesized from oscillators, no samples."""
import math, struct, wave, subprocess, tempfile
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'frontend/public/music'
out.mkdir(parents=True,exist_ok=True)
rate=22050
for name,bpm,notes in [('momentum',120,[110,130.813,164.814,146.832]),('morning',100,[261.626,329.628,391.995,440]),('breathe',80,[174.614,220,261.626,293.665])]:
 data=[]
 for i in range(rate*24):
  t=i/rate;beat=t*bpm/60;f=notes[int(beat/4)%4];phase=beat%1
  envelope=min(1,t/0.08,(24-t)/.12)
  pad=.12*math.sin(2*math.pi*f*t)+.055*math.sin(2*math.pi*f*1.5*t)
  pluck=.12*math.exp(-phase*8)*math.sin(2*math.pi*f*2*t)
  kick=(.22 if name=='momentum' else .10)*math.exp(-phase*24)*math.sin(2*math.pi*55*t)
  v=(pad+pluck+kick)*envelope
  data.append(struct.pack('<h',int(max(-1,min(1,v))*26000)))
 with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
  with wave.open(tmp.name,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(b''.join(data))
  subprocess.run(['ffmpeg','-v','error','-y','-i',tmp.name,'-codec:a','libmp3lame','-b:a','64k',str(out/(name+'.mp3'))],check=True)
(out/'NOTICE.txt').write_text('openGym original instrumental loops\n\n向前一步 / 清晨出发 / 慢慢呼吸\nCreated for this project with scripts/make-community-music.py on 2026-10-19.\nEntirely procedural sine-wave synthesis. No external melody, sample or recording was imported.\nThese project-provided tracks may be used as background music in this openGym instance.\nNot a catalogue of popular commercial songs. No third-party attribution required.\n',encoding='utf8')
