export default function ProfileBio({text,fallback='记录自己的健身故事。'}){
 const lines=String(text||fallback).split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
 return <div className="profile-bio">{lines.map((line,i)=><p key={i}>{line}</p>)}</div>
}
