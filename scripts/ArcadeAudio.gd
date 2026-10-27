class_name ArcadeAudio
extends Node

var muted := false
var activated := false
var voices: Array[AudioStreamPlayer]=[]
var cursor := 0
var beat := 0
var beat_time := 0.0
var last_tick := -1
var seen_events: Dictionary={}
var last_attacks: Dictionary={}
var samples: Dictionary={}

func _ready() -> void:
	activated=not OS.has_feature("web")
	for i in range(12):
		var p:=AudioStreamPlayer.new();add_child(p);voices.append(p)

func tone(hz: float,duration: float,volume: float=.15,shape: int=0) -> void:
	if muted or not activated or voices.is_empty():return
	var key: String="%s:%s:%d"%[hz,duration,shape]
	if not samples.has(key):
		var sample:=AudioStreamWAV.new();sample.format=AudioStreamWAV.FORMAT_16_BITS;sample.mix_rate=22050
		var count:=int(duration*22050);var bytes:=PackedByteArray();bytes.resize(count*2)
		for i in range(count):
			var t: float=float(i)/22050
			var phase: float=t*hz
			var wave: float=sin(phase*TAU)
			if shape==1:wave=(1.0 if fmod(phase,1)<.3 else -1.0)*.6+sin(phase*TAU)*.3
			elif shape==2:wave=sin(t*(hz+900*(1-t/duration))*TAU)*sin(t*17393)
			var env: float=minf(1,t/.012)*pow(maxf(0,1-t/duration),1.5)
			bytes.encode_s16(i*2,int(wave*env*24000))
		sample.data=bytes;samples[key]=sample
	var p: AudioStreamPlayer=voices[cursor%voices.size()];cursor+=1;p.stream=samples[key];p.volume_db=linear_to_db(volume);p.play()

func _process(delta: float) -> void:
	beat_time+=delta
	if beat_time<.24:return
	beat_time-=.24
	var melody: Array[float]=[261.63,329.63,392,523.25,440,392,329.63,293.66,220,261.63,329.63,440,392,329.63,293.66,196]
	tone(melody[beat%16],.2,.035,1)
	if beat%4==0:tone(melody[(beat/4)%16]/2,.6,.045)
	if beat%2==0:tone(70,.1,.04,2)
	beat+=1

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton or event is InputEventKey or event is InputEventScreenTouch:activated=true

func click() -> void:tone(660,.07,.12,1)
func error() -> void:tone(110,.14,.13,1)
func toggle() -> void:
	muted=not muted
	if muted:
		for p in voices:p.stop()

func horn() -> void:
	for hz in [196,246.94,293.66]:tone(hz,1.1,.24,1)
	await get_tree().create_timer(.45).timeout
	for hz in [261.63,329.63,392]:tone(hz,1.8,.24,1)

func observe(state: Dictionary,_replay: bool) -> void:
	var tick: int=int(state.tick)
	if tick==last_tick:return
	if tick<last_tick or tick-last_tick>15:last_attacks.clear();seen_events.clear();last_tick=tick;return
	last_tick=tick
	if seen_events.size()>200:seen_events.clear()
	for event in state.get("_events",[]):
		var key: String=JSON.stringify(event)
		if seen_events.has(key):continue
		seen_events[key]=true
		if float(state.time)-float(event.time)>.15:continue
		match str(event.get("type","")):
			"war_summon":horn()
			"base_hit":tone(880,.22,.18,1);tone(440,.35,.12,1)
			"base_destroyed","war_cyst_burst":tone(45,1.5,.3,2)
			"skill":tone(330,.6,.2,1);tone(495,.9,.14)
	var emitted:=0
	for u in state.get("units",[]):
		var attack: float=float(u.get("atkFxTime",-999))
		var id: int=int(u.id)
		if attack>float(last_attacks.get(id,-999)) and float(state.time)-attack<.08 and emitted<3:
			var def: Dictionary=Bridge.catalog.beasts[u.beast] if u.get("beast","")!="" else Bridge.catalog.civs[u.civId].units[u.unitId]
			var is_melee: bool=float(def.get("range",0))<80
			var pitch: float=110+posmod(str(u.unitId).hash(),240)
			tone(pitch,.1 if is_melee else .16,.07,2 if is_melee or def.get("machine",false) else 1);emitted+=1
		last_attacks[id]=attack
