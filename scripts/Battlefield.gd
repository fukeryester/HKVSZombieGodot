class_name Battlefield
extends Control

signal slot_clicked(slot: int)
var state: Dictionary={}
var seat:=0
var placing: String=""
var catalog: Dictionary={}
var _background: Texture2D
var _last_positions: Dictionary={}
var _moving: Dictionary={}
var _shake:=0.0
var _last_event:=0
var _render_time:=0.0
const BEASTS: Array[String]=["zeppelin","train","mech","portal","king","cyst"]

func _ready() -> void:
	texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	mouse_filter=Control.MOUSE_FILTER_STOP
	custom_minimum_size=Vector2(480,280)
	if ResourceLoader.exists("res://assets/backgrounds/hong_kong_night.png"):
		_background=load("res://assets/backgrounds/hong_kong_night.png")

func update_world(next_state: Dictionary,local_seat: int,db: Dictionary) -> void:
	for u in next_state.get("units",[]):
		var id: int=int(u.id)
		if _last_positions.has(id): _moving[id]=absf(float(u.x)-float(_last_positions[id]))>0.01
		_last_positions[id]=u.x
	state=next_state;seat=local_seat;catalog=db
	for event in state.get("_events",[]):
		if float(state.time)-float(event.time)<.1 and event.get("type","") in ["war_summon","base_destroyed","war_cyst_burst"]: _shake=1.0
	queue_redraw()

func _process(delta: float) -> void:
	_render_time+=delta
	_shake=maxf(0,_shake-delta*1.6)
	if not state.is_empty(): queue_redraw()

func point(x: float,row: int=0,dy: float=0) -> Vector2:
	var lanes:=maxi(1,int(state.get("players",[]).size()/2))
	return Vector2(18+x/1800.0*(size.x-36),size.y*(0.69+0.21*float(row)/maxi(1,lanes-1))+dy)

func _sprite(tex: Texture2D,base: Vector2,dimensions: Vector2,flip: bool=false,tint:=Color.WHITE,angle: float=0.0) -> void:
	if tex==null:return
	# Uniform cell baseline makes every unit stand on its lane, including 4v4.
	draw_set_transform(base,angle,Vector2(-1 if flip else 1,1))
	draw_texture_rect(tex,Rect2(Vector2(-dimensions.x/2,-dimensions.y*.90),dimensions),false,tint)
	draw_set_transform(Vector2.ZERO)

func _bar(pos: Vector2,width: float,current: float,maximum: float,color: Color) -> void:
	draw_rect(Rect2(pos,Vector2(width,5)),Color("15141b"))
	draw_rect(Rect2(pos+Vector2.ONE,Vector2(maxf(0,(width-2)*clampf(current/maxf(1,maximum),0,1)),3)),color)

func _draw() -> void:
	if _background:
		draw_texture_rect(_background,Rect2(Vector2.ZERO,size),false,Color(0.78,0.74,0.78))
	else: draw_rect(Rect2(Vector2.ZERO,size),Color("252531"))
	if state.is_empty():return
	var time: float=float(state.get("time",0))
	var players: Array=state.get("players",[])
	var lanes:=maxi(1,players.size()/2)
	# Entire lower quarter is paved; every player row has a continuous road.
	for row in range(lanes):
		var y:=point(0,row).y
		draw_line(Vector2(0,y+2),Vector2(size.x,y+2),Color(0.72,0.62,0.44,0.20),2)
		for x in range(0,int(size.x),70):draw_line(Vector2(x,y+9),Vector2(x+24,y+9),Color(0.8,0.7,0.48,0.17),2)
	for p in players:
		var row: int=int(p.row)
		var center:=point(float(p.baseX),row)
		var age: int=clampi(int(p.age)-1,0,3)
		var base_tex:=SpriteAtlas.frame("settlements",0 if p.team=="hk" else 1,age,4)
		var jiggle:=0.0
		var hit_elapsed:=time-float(p.get("jellyStartedAt",-999))
		if hit_elapsed<.45:jiggle=sin(hit_elapsed*40)*.025*(1-hit_elapsed/.45)
		var base_dim:=Vector2(150,145)*(1+age*.06)
		if p.get("baseRuined",false):
			_sprite(base_tex,center,Vector2(base_dim.x,base_dim.y*.45),p.team=="zom",Color(.35,.30,.32,.7))
		else:_sprite(base_tex,center,base_dim,p.team=="zom",Color.WHITE,jiggle)
		_bar(center+Vector2(-54,-116-age*6),108,float(p.baseHp),float(p.baseHpMax),PixelTheme.JADE if p.team=="hk" else PixelTheme.RED)
		draw_string(PixelTheme.FONT,center+Vector2(-52,-122-age*6),str(int(p.seat)+1)+" · "+str(p.age)+"本",HORIZONTAL_ALIGNMENT_LEFT,-1,12,PixelTheme.PAPER)
		var resource_x: float=float(p.baseX)+(-1 if p.team=="hk" else 1)*170
		_sprite(SpriteAtlas.frame("settlements",3,2 if p.team=="hk" else 3,4),point(resource_x,row),Vector2(172,95))
		for site in p.sites:
			var cols: Dictionary={"house":0,"barracks":1,"town_center":2,"mill":3,"castle":0,"bombard":1}
			var mounted: bool=int(site.slot)>=6
			var site_pos:=point(float(site.x),row,-28 if mounted else -26)
			var tex:=SpriteAtlas.frame("settlements",3 if mounted else 2,int(cols.get(site.kind,0)),4)
			_sprite(tex,site_pos,Vector2(65,72) if not mounted else Vector2(44,48),p.team=="zom",Color.WHITE if site.done else Color(.85,.78,.58,.5))
			if not site.done:
				_bar(site_pos+Vector2(-22,-56),44,float(site.progress),1,PixelTheme.GOLD)
		for w in p.workers:
			var worker_row:=0 if p.team=="hk" else 1
			if p.civId=="zom_robot":worker_row=2
			if p.civId=="zom_asym":worker_row=3
			var wf:=0
			if w.phase=="walk":wf=1+int(time*7+float(w.id))%2
			elif w.job!="idle":wf=3 if int(time*4+float(w.id))%2==0 else 0
			_sprite(SpriteAtlas.frame("workers",worker_row,wf,4),point(float(w.x),row,4),Vector2(36,45)*(1.22 if worker_row==3 else 1.0),p.team=="zom")
	var units: Array=state.get("units",[]).duplicate()
	units.sort_custom(func(a,b):return float(a.get("row",0))<float(b.get("row",0)))
	for u in units:
		if float(u.hp)<=0:continue
		var beast: String=str(u.get("beast",""))
		var row: int=int(u.get("row",0))
		var loc:=point(float(u.x),row)
		var attacking: bool=time-float(u.get("atkFxTime",-999))<.22
		var frame:=3 if attacking else 1+int(time*6+float(u.id))%2 if _moving.get(int(u.id),false) else 0
		var tex: Texture2D
		var dims:=Vector2(68,82)
		if not beast.is_empty():
			tex=SpriteAtlas.frame("war_beasts",BEASTS.find(beast),frame,6)
			dims=Vector2(240,235)
			if beast=="zeppelin":loc.y-=130;dims=Vector2(300,230)
			if beast=="train":dims=Vector2(330*float(u.get("parts",[]).filter(func(part):return float(part.hp)>0).size())/5,180)
			if beast=="cyst":dims=Vector2(290,275)
		else:
			var civ: Dictionary=catalog.civs[u.civId]
			var ids: Array=civ.units.keys()
			var def: Dictionary=civ.units[u.unitId]
			tex=SpriteAtlas.frame(str(u.civId),ids.find(u.unitId),frame)
			var tier: int=int(def.tier)
			dims*=1+maxi(0,tier-2)*.16
			if bool(def.get("machine",false)):dims*=1.2
			if str(u.civId)=="zom_asym":dims*=float(def.art.get("scale",1))
			if u.get("molted",false):dims*=1.18
			if float(u.get("jumpUntil",0))>time:loc.y-=sin(clampf((time-float(u.get("jumpStart",time)))/maxf(.01,float(u.get("jumpDur",1))),0,1)*PI)*35
		var flip: bool=float(u.get("dir",1))<0
		var tint:=Color.WHITE
		if u.get("poison")!=null:tint=Color(.8,1,.65)
		if float(u.get("stunUntil",0))>time:tint=Color(.65,.8,1)
		_sprite(tex,loc,dims,flip,tint)
		if float(u.hp)<float(u.hpMax) or not beast.is_empty():_bar(loc+Vector2(-dims.x*.26,-dims.y*.88),dims.x*.52,float(u.hp),float(u.hpMax),PixelTheme.JADE if u.team=="hk" else PixelTheme.RED)
		if attacking:
			var attack_pos:=loc+Vector2((-1 if flip else 1)*dims.x*.35,-dims.y*.45)
			draw_circle(attack_pos,3,PixelTheme.GOLD)
	for shot in state.get("projectiles",[]):
		var fraction: float=clampf(float(shot.get("t",0))/maxf(.001,float(shot.get("dur",1))),0,1)
		var from:=point(float(shot.get("x_from",0)),int(shot.get("fromRow",0)),-45)
		var to:=point(float(shot.get("x_to",0)),int(shot.get("toRow",0)),-35)
		var loc:=from.lerp(to,fraction)
		if float(shot.get("splash",0))>0:loc.y-=sin(fraction*PI)*65
		draw_line(loc,loc-(to-from).normalized()*11,PixelTheme.GOLD,2)
	for effect in state.get("effects",[]):
		var kind: String=str(effect.get("kind",""))
		var loc:=point(float(effect.get("x",900)),int(effect.get("row",0)),-30)
		var life: float=float(effect.get("life",.5))
		var opacity: float=clampf(life/maxf(.01,float(effect.get("initLife",1))),0,1)
		if kind in ["war_tracer","war_missile","war_bomb"]:
			var target:=point(float(effect.get("tx",900)),int(effect.get("toRow",effect.get("row",0))),-35)
			if effect.get("flying",false):loc.y-=130
			if kind=="war_tracer":draw_line(loc,target,Color(1,.8,.35,opacity),2)
			else:
				var missile:=loc.lerp(target,1-opacity);missile.y-=sin(opacity*PI)*120
				draw_rect(Rect2(missile,Vector2(10,5)),Color("ffe5ac"));draw_line(missile,missile+Vector2(-15,-8),PixelTheme.RED,4)
		elif kind=="war_laser":
			var end:=point(1800 if int(effect.get("dir",1))>0 else 0,int(effect.get("row",0)),-35)
			draw_line(loc,end,Color(1,.15,.25,.25),24);draw_line(loc,end,Color(1,.6,.4,.7),9);draw_line(loc,end,Color(1,.95,.8),3)
		elif kind in ["war_execution","war_execution_hit"]:
			draw_arc(loc,34,0,TAU,24,PixelTheme.RED,3);draw_line(loc-Vector2(40,40),loc+Vector2(40,40),PixelTheme.RED,3);draw_line(loc-Vector2(-40,40),loc+Vector2(-40,40),PixelTheme.RED,3)
		elif kind=="war_bloodmoon":
			draw_rect(Rect2(Vector2.ZERO,size),Color(.8,.03,.1,opacity*.28));draw_arc(loc,(1-opacity)*size.x,0,TAU,64,Color(1,.15,.2,opacity),6)
		elif kind=="war_counterattack":
			draw_arc(loc,(1-opacity)*310,0,TAU,40,Color(1,.8,.3,opacity),6)
			draw_string(PixelTheme.FONT,Vector2(size.x*.34,65),"反 攻 号 角   ·   战 争 巨 兽",HORIZONTAL_ALIGNMENT_LEFT,-1,28,Color(1,.85,.5,opacity))
		elif kind.begins_with("war_") or kind in ["explosion","base_explosion","base_burst"]:
			var ratio: float=clampf(life/maxf(.01,float(effect.get("initLife",1))),0,1)
			var r: float=(1-ratio)*110+20
			draw_arc(loc,r,0,TAU,32,Color(1,.65,.3,ratio),3)
			draw_arc(loc,r*.6,0,TAU,24,Color(.65,.9,.85,ratio),2)
			for j in range(12):
				var p:=loc+Vector2.from_angle(j*TAU/12+float(effect.get("id",0)))*r
				draw_rect(Rect2(p,Vector2(4,4)),Color(1,.8,.5,ratio))
		else:
			# Civilization abilities share the original effect records, with readable
			# faction colors and names even where their mechanics are not radial.
			var tint:=Color(.45,.85,.7,opacity*.6) if "heal" in kind or "buff" in kind else Color(.8,.32,.65,opacity*.6)
			draw_arc(loc,25+(1-opacity)*45,0,TAU,20,tint,3)
	for event in state.get("_events",[]):
		var elapsed: float=time-float(event.time)
		if event.type=="skill" and elapsed<1.5:
			var owner: Dictionary=players[int(event.data.seat)]
			var label_pos:=point(float(owner.baseX),int(owner.row),-145-elapsed*20)
			draw_string(PixelTheme.FONT,label_pos-Vector2(75,0),str(catalog.skills[event.data.skill].name),HORIZONTAL_ALIGNMENT_LEFT,-1,20,Color(1,.85,.5,1-elapsed/1.5))
	if not placing.is_empty() and seat<players.size():
		var p: Dictionary=players[seat]
		var mounted: bool=placing in ["castle","bombard"]
		for slot in ([6,7] if mounted else [0,1,2,3,4,5]):
			var x: float=float(p.baseX)+(1 if p.team=="hk" else -1)*(39 if slot>=6 else -(65+slot*44))
			var pos:=point(x,int(p.row),-35 if slot>=6 else -20)
			draw_rect(Rect2(pos-Vector2(20,30),Vector2(40,40)),Color(.85,.7,.35,.25))
			draw_rect(Rect2(pos-Vector2(20,30),Vector2(40,40)),PixelTheme.GOLD,false,2)
			draw_string(PixelTheme.FONT,pos-Vector2(5,3),str(slot+1),HORIZONTAL_ALIGNMENT_LEFT,-1,16,PixelTheme.PAPER)
	if _shake>0:
		draw_rect(Rect2(Vector2.ZERO,size),Color(1,.65,.4,_shake*.08))

func _gui_input(event: InputEvent) -> void:
	if placing.is_empty() or state.is_empty():return
	if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT:
		var p: Dictionary=state.players[seat]
		var mounted: bool=placing in ["castle","bombard"]
		for slot in ([6,7] if mounted else [0,1,2,3,4,5]):
			var x: float=float(p.baseX)+(1 if p.team=="hk" else -1)*(39 if slot>=6 else -(65+slot*44))
			if event.position.distance_to(point(x,int(p.row),-35 if slot>=6 else -20))<34:
				slot_clicked.emit(slot);accept_event();return
