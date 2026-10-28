extends Control

var page: Control
var overlay: Control
var db: Dictionary={}
var view: Dictionary={}
var screen := "loading"
var chosen := "hk_police"
var team_size := 1
var ranked := false
var field: Battlefield
var top: Label
var notice: Label
var upgrade: ProgressBar
var upgrade_button: Button
var beast_button: Button
var pause_button: Button
var content: VBoxContainer
var current_tab := "army"
var updates: Array[Callable]=[]
var structural_key := ""
var army_lane := "auto"
var worker_lane := "auto"
var p_pressed := -1000
var modal_beasts := false
var result_shown := false
var replay_layout := false
var timeline: HSlider
var dragging := false
var sound: ArcadeAudio
var toast: Label
var toast_tween: Tween
var last_notice: String=""
const JOBS := {"food":"食物","wood":"木头","gold":"黄金","stone":"石头","idle":"待命"}

func _ready() -> void:
	Input.use_accumulated_input=false
	theme=PixelTheme.make()
	sound=ArcadeAudio.new();add_child(sound)
	Bridge.updated.connect(_update)
	Bridge.failed.connect(func(message):_message("启动失败",message))
	_new_page()
	page.add_child(PixelTheme.label("正在点亮维港灯火……",36))
	if not Bridge.ready_ok: await Bridge.connected
	db=Bridge.catalog
	_title_menu()
	if "--smoke" in OS.get_cmdline_user_args(): _smoke()

func _title_menu() -> void:
	screen="title";_new_page()
	_spacer(page)
	_text(page,"香港大战僵尸 Ⅱ",64,PixelTheme.GOLD)
	_text(page,"生 死 存 亡",36)
	_text(page,"维港最后的防线",22,PixelTheme.DIM)
	_spacer(page)
	_button(page,"开始游戏 · 选择文明",_menu)
	_button(page,"单局回放",_archive)
	_button(page,"文明与兵种图鉴",func():_codex(chosen))
	_button(page,"账号",_account)
	_button(page,"音乐与音效开关",func():sound.toggle())
	_spacer(page)

func _clear(node: Node) -> void:
	for child in node.get_children(): node.remove_child(child);child.queue_free()

func _new_page() -> VBoxContainer:
	if is_instance_valid(page):remove_child(page);page.queue_free()
	_close_modal();updates.clear();structural_key=""
	page=VBoxContainer.new();page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	page.offset_left=20;page.offset_right=-20;page.offset_top=16;page.offset_bottom=-16
	add_child(page)
	return page

func _draw() -> void:
	draw_texture_rect(preload("res://assets/backgrounds/hong_kong_night.png"),Rect2(Vector2.ZERO,size),false,Color(.3,.27,.32))

func _row(parent: Node) -> HBoxContainer:
	var r:=HBoxContainer.new();parent.add_child(r);return r

func _text(parent: Node,text: String,size_px: int=24,color:=PixelTheme.PAPER) -> Label:
	var l:=PixelTheme.label(text,mini(size_px,14) if screen=="play" else size_px,color);parent.add_child(l);return l

func _button(parent: Node,text: String,fn: Callable) -> Button:
	var b:=PixelTheme.button(text,func():sound.click();fn.call());parent.add_child(b)
	if screen=="play":
		b.custom_minimum_size.y=26;b.add_theme_font_size_override("font_size",14)
	return b

func _panel(parent: Node) -> VBoxContainer:
	var p:=PanelContainer.new();parent.add_child(p)
	if screen=="play":
		var style:=PixelTheme.box(PixelTheme.PANEL,Color("706047"),1)
		style.content_margin_top=2;style.content_margin_bottom=2;p.add_theme_stylebox_override("panel",style)
	var v:=VBoxContainer.new();p.add_child(v);return v

func _scroll(parent: Node) -> VBoxContainer:
	var scroll:=ScrollContainer.new();scroll.size_flags_vertical=Control.SIZE_EXPAND_FILL;parent.add_child(scroll)
	var v:=VBoxContainer.new();v.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.add_child(v);return v

func _wrap(parent: Node,text: String,size_px: int=20) -> Label:
	var l:=_text(parent,text,size_px);l.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;return l

func _spacer(parent: Node) -> void:
	var c:=Control.new();c.size_flags_vertical=Control.SIZE_EXPAND_FILL;c.size_flags_horizontal=Control.SIZE_EXPAND_FILL;parent.add_child(c)

func _menu() -> void:
	screen="menu";_new_page();result_shown=false
	var heading:=_row(page)
	_text(heading,"香港大战僵尸 Ⅱ",48,PixelTheme.GOLD);_spacer(heading)
	_button(heading,"声音",func():sound.toggle())
	_button(heading,"账号",_account)
	_text(page,"生 死 存 亡   /   维港夜战",28)
	_text(page,"选择文明 · 建设后方 · 指挥反攻",20,PixelTheme.DIM)
	var columns:=_row(page);columns.size_flags_vertical=Control.SIZE_EXPAND_FILL
	var left:=_panel(columns);left.custom_minimum_size.x=875;left.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	var strip:=_row(left)
	for side in ["hk","zom"]:
		_button(strip,"香港阵营" if side=="hk" else "僵尸阵营",func():chosen=db.human[0] if side=="hk" else db.zombie[0];_menu())
	var grid:=GridContainer.new();grid.columns=3;left.add_child(grid)
	var ids: Array=db.human if db.civs[chosen].side=="hk" else db.zombie
	for id in ids:
		var c: Dictionary=db.civs[id]
		var card:=_panel(grid);card.custom_minimum_size=Vector2(270,210)
		var image:=SpriteAtlas.portrait(id);image.custom_minimum_size=Vector2(90,110);card.add_child(image)
		_button(card,("◆ " if id==chosen else "")+str(c.name),func():chosen=id;_menu())
		_text(card,str(c.get("tagline",c.get("subtitle",""))),16,PixelTheme.DIM)
	var right:=_panel(columns);right.custom_minimum_size.x=420
	_text(right,str(db.civs[chosen].name),28,PixelTheme.GOLD)
	_wrap(right,str(db.civs[chosen].get("desc","文明特性与兵种详情请查看图鉴。")),20)
	var format:=OptionButton.new()
	for n in range(1,5):format.add_item("%d v %d    联队作战"%[n,n])
	format.select(team_size-1);format.item_selected.connect(func(i):team_size=i+1);right.add_child(format)
	var check:=CheckButton.new();check.text="排位对局";check.button_pressed=ranked;check.toggled.connect(func(on):ranked=on);right.add_child(check)
	_button(right,"开始战役 · 人机对战",_start_local)
	_button(right,"创建联机房间",func():_network("create",{"size":team_size,"ranked":ranked}))
	var join:=_row(right);var code:=LineEdit.new();code.placeholder_text="6位房间号";code.max_length=6;code.size_flags_horizontal=Control.SIZE_EXPAND_FILL;join.add_child(code)
	_button(join,"加入",func():_network("join",{"code":code.text}))
	_spacer(right)
	_button(right,"文明与兵种图鉴",func():_codex(chosen))
	_button(right,"单局回放 · 最近五场",_archive)
	_button(right,"排位与战绩",_ranking)
	_text(page,"1–7 训练士兵    W 训练农民    U 升本    Space 暂停    双击 P 测试巨兽",18,PixelTheme.DIM)

func _start_local() -> void:
	var side: String=db.civs[chosen].side
	await Bridge.command("start",{"size":team_size,"side":side,"civ":chosen,"enemy":"zom_classic" if side=="hk" else "hk_police","ranked":ranked})

func _network(method: String,args: Dictionary) -> void:
	var r:=await Bridge.command(method,args)
	if r.get("ok",false)==false:_message("联机",str(r.get("error","连接失败，请先登录 GameHub。")))

func _update(v: Dictionary) -> void:
	view=v
	var target: String=v.get("screen","menu")
	if target=="play" and (screen!="play" or replay_layout!=bool(v.get("replay",false))):_play()
	elif target=="lobby":
		var key:=JSON.stringify(v.get("lobby"))+str(v.get("room"))
		if screen!="lobby" or key!=structural_key:_lobby();structural_key=key
	if target!="play" or screen!="play" or v.get("state")==null:return
	var s: Dictionary=v.state
	var p: Dictionary=s.players[int(v.seat)]
	field.update_world(s,int(v.seat),db)
	top.text="%s  |  %s   食 %d  木 %d  金 %d  石 %d  |  人口 %d/%d  |  基地 %d/%d"%[clock_text(s.time),db.civs[p.civId].name,p.food,p.wood,p.gold,p.stone,p.pop,p.popCap,p.baseHp,p.baseHpMax]
	if float(s.time)-float(p.get("lastHitTime",-999))<2:top.modulate=PixelTheme.RED if int(Time.get_ticks_msec()/180)%2==0 else Color.WHITE
	else:top.modulate=Color.WHITE
	var researching: bool=p.get("research")!=null
	upgrade.visible=researching
	if researching:upgrade.value=100*clampf((float(s.time)-float(p.research.started))/float(p.research.duration),0,1)
	upgrade_button.text="升至 %d 本 · %s"%[int(p.age)+1,cost(db.ages[int(p.age)])] if int(p.age)<4 else "四本 · 巅峰时代"
	upgrade_button.disabled=researching or int(p.age)>=4 or bool(v.replay)
	beast_button.visible=bool(v.ui.canSummon)
	pause_button.text="继续" if bool(v.paused) else "暂停"
	pause_button.disabled=not bool(v.local)
	if timeline and is_instance_valid(timeline):
		timeline.max_value=maxf(1,float(v.replayEnd))
		if not dragging:timeline.set_value_no_signal(float(s.tick))
	notice.text=("复盘演算中…… " if v.seeking else "")+str(v.notice)+("  ·  "+str(v.saveStatus) if v.saveStatus else "")
	if str(v.notice)!=last_notice:
		last_notice=str(v.notice)
		if not last_notice.is_empty():_toast(last_notice)
	var key:=current_tab+str(v.seat)+str(p.age)+JSON.stringify(p.sites.map(func(site):return [site.id,site.done]))
	if key!=structural_key:_tab(current_tab);structural_key=key
	for fn in updates:fn.call(p,s,v)
	if not v.seeking:sound.observe(s,bool(v.replay))
	if bool(v.openBeasts) and not modal_beasts:_beasts()
	if s.over and not result_shown and not v.replay:
		result_shown=true;_result()

func _play() -> void:
	screen="play";_new_page();army_lane="auto";worker_lane="auto";current_tab="army";result_shown=false
	page.add_theme_constant_override("separation",2)
	replay_layout=bool(view.get("replay",false))
	top=_text(page,"",20)
	var controls:=_row(page)
	upgrade_button=_button(controls,"升本",func():_act({"op":"age"}))
	upgrade=ProgressBar.new();upgrade.custom_minimum_size=Vector2(190,28);controls.add_child(upgrade)
	beast_button=_button(controls,"◆ 召唤战争巨兽 ◆",_beasts);beast_button.modulate=PixelTheme.GOLD
	_spacer(controls)
	pause_button=_button(controls,"暂停",func():Bridge.command("pause"))
	_button(controls,"×1",func():Bridge.command("speed",{"value":1})).disabled=not bool(view.local)
	_button(controls,"×2",func():Bridge.command("speed",{"value":2})).disabled=not bool(view.local)
	_button(controls,"菜单",_pause_menu)
	field=Battlefield.new();field.size_flags_vertical=Control.SIZE_EXPAND_FILL;page.add_child(field)
	top.reparent(field);top.position=Vector2(10,8)
	controls.reparent(field);controls.position=Vector2(10,30)
	toast=PixelTheme.label("",22,PixelTheme.GOLD);field.add_child(toast)
	toast.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE);toast.offset_top=90
	toast.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;toast.mouse_filter=Control.MOUSE_FILTER_IGNORE
	toast.add_theme_color_override("font_shadow_color",Color.BLACK);toast.add_theme_constant_override("shadow_offset_x",2);toast.add_theme_constant_override("shadow_offset_y",2)
	field.slot_clicked.connect(func(slot):_act({"op":"construct","kind":field.placing,"slot":slot});field.placing="")
	if view.get("replay",false):
		var replay_row:=_row(page)
		_text(replay_row,"复盘",20,PixelTheme.GOLD)
		for n in [4,8,16]:_button(replay_row,"×"+str(n),func():Bridge.command("speed",{"value":n}))
		timeline=HSlider.new();timeline.size_flags_horizontal=Control.SIZE_EXPAND_FILL;timeline.step=1;replay_row.add_child(timeline)
		timeline.drag_started.connect(func():dragging=true)
		timeline.drag_ended.connect(func(changed):dragging=false;if changed:Bridge.command("seek",{"tick":int(timeline.value)}))
		var seats:=OptionButton.new()
		for p in view.state.players:seats.add_item(str(int(p.seat)+1)+" · "+str(p.name))
		seats.select(int(view.seat));seats.item_selected.connect(func(i):Bridge.command("seat",{"seat":i}));replay_row.add_child(seats)
	else:timeline=null
	var tabs:=_row(page)
	for pair in [["army","军队训练"],["workers","农民与经济"],["buildings","建筑与时代"],["skills","文明技能"]]:
		_button(tabs,pair[1],func():_tab(pair[0]);structural_key="")
	var container:=PanelContainer.new();container.custom_minimum_size.y=110;page.add_child(container)
	content=_scroll(container)
	notice=_text(page,"",18,PixelTheme.DIM);notice.clip_text=true

func _toast(message: String) -> void:
	if not is_instance_valid(toast):return
	if toast_tween:toast_tween.kill()
	toast.text=message;toast.modulate=Color.WHITE
	toast_tween=create_tween();toast_tween.tween_interval(2.5);toast_tween.tween_property(toast,"modulate:a",0.0,.5)

func _tab(which: String) -> void:
	if not is_instance_valid(content) or view.get("state")==null:return
	current_tab=which;updates.clear();_clear(content)
	var p: Dictionary=view.state.players[int(view.seat)]
	var read_only: bool=bool(view.replay)
	if which=="army":
		_lanes(content,"army",p)
		var cards:=_row(content);var ids: Array=db.civs[p.civId].units.keys()
		for i in range(ids.size()):
			var id: String=ids[i];var u: Dictionary=db.civs[p.civId].units[id]
			var card:=_panel(cards);card.size_flags_horizontal=Control.SIZE_EXPAND_FILL;card.custom_minimum_size.x=156
			var b:=_button(card,str(i+1)+" · "+str(u.name),func():_act({"op":"spawn","unit":id,"laneId":army_lane}))
			b.add_theme_font_size_override("font_size",14)
			var price:=_text(card,cost(view.ui.army[i].cost),16,PixelTheme.GOLD)
			b.tooltip_text=str(u.get("desc",""))+"\n生命 %d / 攻击 %d / 速度 %d\n%d本 · %d人口 · %d秒"%[u.hp,u.dmg,u.speed,u.tier,u.pop,u.buildTime]
			updates.append(func(_p,_s,v):b.disabled=not v.ui.army[i].enabled;price.text=cost(v.ui.army[i].cost))
		_queues(content,"army",p)
	elif which=="workers":
		_lanes(content,"worker",p)
		var worker_button:=_button(content,"训练农民 · "+cost(view.ui.workerPrice)+" · "+str(view.ui.workerTime)+"秒",func():_act({"op":"worker","laneId":worker_lane}));worker_button.disabled=read_only
		var jobs:=_row(content)
		for job in JOBS:
			var column:=_panel(jobs);column.size_flags_horizontal=Control.SIZE_EXPAND_FILL
			var count:=_text(column,JOBS[job],22,PixelTheme.GOLD)
			updates.append(func(q,_s,_v):count.text=JOBS[job]+" · "+str(q.workers.filter(func(w):return w.job==job).size())+"人")
			var line:=_row(column)
			_button(line,"+ 调入",func():_act({"op":"assign","job":job})).disabled=read_only
			_button(line,"− 调出",func():
				var ws: Array=_player().workers.filter(func(w):return w.job==job)
				if not ws.is_empty():_act({"op":"assign","job":"idle","workerId":int(ws.back().id)})
			).disabled=read_only
		var repairs:=_row(content);_text(repairs,"基地维修",20)
		for q in view.state.players:
			if q.team==p.team:_button(repairs,"派1人 → "+str(int(q.seat)+1)+"号基地",func():_act({"op":"repair_base","targetSeat":int(q.seat),"count":1})).disabled=read_only
		_queues(content,"worker",p)
	elif which=="buildings":
		var buildings:=_row(content)
		for d in view.ui.buildings:
			var card:=_panel(buildings);card.size_flags_horizontal=Control.SIZE_EXPAND_FILL
			_text(card,str(d.name),22,PixelTheme.GOLD);_text(card,cost(d.cost),18)
			var slots:=OptionButton.new()
			for slot in d.slots:slots.add_item("后方位置 "+str(int(slot)+1),int(slot))
			card.add_child(slots)
			_button(card,"派农民建造",func():_act({"op":"construct","kind":d.id,"slot":slots.get_selected_id()})).disabled=read_only
			_button(card,"在地图选址",func():field.placing=d.id).disabled=read_only
		for site in p.sites:
			var line:=_row(content);var status:=_text(line,"",20)
			updates.append(func(q,_s,_v):
				for current in q.sites:
					if current.id==site.id:status.text="位置%d · %s · %s"%[int(site.slot)+1,db.buildings[site.kind].name,"完工" if current.done else str(int(float(current.progress)*100))+"%"]
			)
			if not site.done:_button(line,"恢复施工",func():_act({"op":"resume","siteId":int(site.id)})).disabled=read_only
			_button(line,"拆除 / 返还部分资源",func():_act({"op":"demolish","siteId":int(site.id)})).disabled=read_only
	elif which=="skills":
		var cards:=_row(content)
		for i in range(view.ui.skills.size()):
			var d: Dictionary=view.ui.skills[i];var card:=_panel(cards);card.custom_minimum_size=Vector2(410,180);card.size_flags_horizontal=Control.SIZE_EXPAND_FILL
			_text(card,str(d.name),28,PixelTheme.GOLD);_wrap(card,str(d.get("desc","")),20)
			var b:=_button(card,"施放",func():_act({"op":"skill","skill":d.id}))
			updates.append(func(q,_s,v):
				var sk: Dictionary=v.ui.skills[i]
				b.text="冷却 %d 秒"%ceilf(float(sk.cooldown)) if float(sk.cooldown)>0 else "施放 · 能量 "+str(sk.get("cost",0))
				b.disabled=bool(v.replay) or float(sk.cooldown)>0 or float(q.energy)<float(sk.get("cost",0)) or int(q.age)<int(sk.get("age",1))
			)
		var energy:=_text(content,"",22);updates.append(func(q,_s,_v):energy.text="当前文明能量：%d"%q.energy)

func _lanes(parent: Node,kind: String,p: Dictionary) -> void:
	var row:=_row(parent);_text(row,"士兵队列" if kind=="army" else "农民队列",20,PixelTheme.GOLD)
	var select:=OptionButton.new();select.add_item("自动选择最早空闲队列");select.set_item_metadata(0,"auto")
	select.add_theme_font_size_override("font_size",14)
	var lanes: Array=view.ui.armyLanes if kind=="army" else view.ui.workerLanes
	for lane in lanes:select.add_item(lane.name);select.set_item_metadata(select.item_count-1,lane.id)
	var chosen_lane: String=army_lane if kind=="army" else worker_lane
	for i in range(select.item_count):
		if select.get_item_metadata(i)==chosen_lane:select.select(i)
	select.item_selected.connect(func(i):
		if kind=="army":army_lane=select.get_item_metadata(i)
		else:worker_lane=select.get_item_metadata(i)
	)
	row.add_child(select);_text(row,"每增建一座%s，增加一条并行队列"%("兵营" if kind=="army" else "城镇中心"),18,PixelTheme.DIM)

func _queues(parent: Node,kind: String,p: Dictionary) -> void:
	var lanes: Array=view.ui.armyLanes if kind=="army" else view.ui.workerLanes
	for lane in lanes:
		var row:=_row(parent);_text(row,lane.name,18)
		var empty:=_text(row,"空闲",18,PixelTheme.DIM)
		var buttons: Dictionary={}
		updates.append(func(q,s,v):
			var queue: Array=q.queue if kind=="army" else q.workerQueue
			var orders: Array=queue.filter(func(order):return order.laneId==lane.id)
			empty.visible=orders.is_empty()
			var active: Array=orders.map(func(order):return int(order.id))
			for id in buttons.keys():
				if not active.has(id):row.remove_child(buttons[id]);buttons[id].queue_free();buttons.erase(id)
			for order in orders:
				var id: int=int(order.id)
				if not buttons.has(id):
					var b:=_button(row,"",func():_act({"op":"cancel_training","kind":kind,"orderId":id}))
					b.add_theme_font_size_override("font_size",16);b.disabled=bool(v.replay);b.tooltip_text="点击取消，退还全部资源和预占人口";buttons[id]=b
				var name: String=db.civs[q.civId].units[order.unitId].name if kind=="army" else "农民"
				buttons[id].text=name+" %d秒 ×"%maxf(0,ceilf(float(order.ready)-float(s.time)))
		)

func _act(args: Dictionary) -> void:
	var r:=await Bridge.command("action",args)
	if not r.get("ok",false):
		sound.error();_toast(str(r.get("error",view.get("notice","无法执行此操作"))))

func _player() -> Dictionary:
	return view.state.players[int(view.seat)]

func _lobby() -> void:
	screen="lobby";_new_page()
	_text(page,"集结室 · "+str(view.get("room","连接中")),42,PixelTheme.GOLD)
	var lobby: Variant=view.get("lobby")
	if lobby==null:_text(page,"等待房主同步……");return
	var list:=_scroll(page)
	for i in range(lobby.players.size()):
		var p: Variant=lobby.players[i];var row:=_row(list)
		_text(row,"%d · %s"%[i+1,"香港" if i<int(lobby.size) else "僵尸"],24)
		if p!=null:_text(row,str(p.name)+" · "+str(db.civs[p.civId].name)+(" · 已准备" if p.ready else " · 未准备"),24)
		else:_text(row,"空位",24,PixelTheme.DIM)
		if view.host and (p==null or p.isAI):
			var options:=OptionButton.new();options.add_item("空位");options.set_item_metadata(0,"")
			var ids: Array=db.human if i<int(lobby.size) else db.zombie
			for id in ids:options.add_item("AI · "+str(db.civs[id].name));options.set_item_metadata(options.item_count-1,id)
			if p!=null:options.select(ids.find(p.civId)+1)
			options.item_selected.connect(func(n):Bridge.command("bot",{"slot":i,"civ":options.get_item_metadata(n)}));row.add_child(options)
	var choice:=OptionButton.new()
	for id in db.civs:choice.add_item(db.civs[id].name);choice.set_item_metadata(choice.item_count-1,id)
	choice.item_selected.connect(func(i):var id: String=choice.get_item_metadata(i);Bridge.command("choice",{"civ":id,"side":db.civs[id].side}));page.add_child(choice)
	var buttons:=_row(page)
	_button(buttons,"准备 / 取消准备",func():Bridge.command("ready"))
	if view.host:_button(buttons,"全员就绪，开始战斗",func():Bridge.command("network_start"))
	_button(buttons,"离开房间",func():await Bridge.command("leave");_menu())
	_wrap(page,str(view.notice),20)

func _modal(title: String) -> VBoxContainer:
	_close_modal()
	overlay=ColorRect.new();overlay.color=Color(0.03,.025,.04,.9);overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);add_child(overlay)
	var panel:=PanelContainer.new();overlay.add_child(panel);panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left=70;panel.offset_right=-70;panel.offset_top=55;panel.offset_bottom=-55
	var column:=VBoxContainer.new();panel.add_child(column)
	var row:=_row(column);_text(row,title,34,PixelTheme.GOLD);_spacer(row);_button(row,"关闭",_close_modal)
	return _scroll(column)

func _close_modal() -> void:
	modal_beasts=false
	if is_instance_valid(overlay):remove_child(overlay);overlay.queue_free();overlay=null

func _message(title: String,text: String) -> void:
	_wrap(_modal(title),text,24)

func _beasts() -> void:
	var body:=_modal("吹响反攻号角 · 选择战争巨兽");modal_beasts=true
	Bridge.command("dismiss_beasts")
	_wrap(body,"全队共享一次机会。登场清除召唤基地附近的普通敌军；巨兽不会直接攻击基地。",22)
	var cards:=_row(body)
	for id in db.beasts:
		var d: Dictionary=db.beasts[id]
		if d.team!=_player().team:continue
		var card:=_panel(cards);card.custom_minimum_size=Vector2(400,370);card.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		var img:=TextureRect.new();img.texture=SpriteAtlas.frame("war_beasts",Battlefield.BEASTS.find(id),0,6);img.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;img.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;img.custom_minimum_size=Vector2(250,260);card.add_child(img)
		_text(card,str(d.name),28,PixelTheme.GOLD);_wrap(card,str(d.desc),20)
		_button(card,"召唤",func():_act({"op":"summon_beast","kind":id});_close_modal())

func _pause_menu() -> void:
	var body:=_modal("指挥菜单")
	_button(body,"声音开关",func():sound.toggle())
	_button(body,"文明图鉴",func():_codex(_player().civId))
	_button(body,"认输并结算",func():_act({"op":"resign"});_close_modal())
	_button(body,"保存本局回放并退出",func():await Bridge.command("leave");_menu())
	_wrap(body,"回放保存在本设备，最近五场自动轮替。联机对局不能暂停。",22)

func _result() -> void:
	var body:=_modal("战斗结束 · "+("胜利" if view.state.winner==_player().team else "败北"))
	_text(body,"用时 "+clock_text(view.state.time),26)
	if view.state.gmUsed:_text(body,"本局使用过 GM，不计入排位。",22,PixelTheme.GOLD)
	var result: Variant=view.get("result")
	if result is Dictionary:
		for key in ["kills","losses","score","rating","delta"]:
			if result.has(key):_text(body,str(key)+" : "+str(result[key]),22)
	_button(body,"立即复盘",func():_close_modal();Bridge.command("watch_last"))
	_button(body,"返回主菜单",func():await Bridge.command("leave");_menu())

func _codex(id: String) -> void:
	var body:=_modal("文明图鉴 · "+str(db.civs[id].name))
	var select:=OptionButton.new()
	for civ in db.civs:select.add_item(db.civs[civ].name);select.set_item_metadata(select.item_count-1,civ);if civ==id:select.select(select.item_count-1)
	select.item_selected.connect(func(i):_codex(select.get_item_metadata(i)));body.add_child(select)
	_wrap(body,str(db.civs[id].get("desc","")),24)
	var grid:=GridContainer.new();grid.columns=4;body.add_child(grid);var index:=0
	for uid in db.civs[id].units:
		var u: Dictionary=db.civs[id].units[uid];var card:=_panel(grid);card.custom_minimum_size.x=270
		card.add_child(SpriteAtlas.portrait(id,index));index+=1
		_text(card,str(u.name),24,PixelTheme.GOLD)
		_text(card,"%d本 · 生命%d · 攻击%d"%[u.tier,u.hp,u.dmg],20)
		_wrap(card,str(u.get("desc","")),18)

func _archive() -> void:
	var r:=await Bridge.command("archive")
	var body:=_modal("单局回放 · 本机最近五场")
	_wrap(body,"输入按原始逻辑帧重放。跳转通过恢复检查点再逐帧演算，战斗结果不因播放速度改变。",22)
	for entry in r.get("entries",[]):
		var line:=_panel(body);_text(line,str(entry.ended_at).replace("T"," ").left(19)+" · "+str(entry.mode)+" · "+str(db.civs[entry.civId].name),24)
		var buttons:=_row(line);_text(buttons,clock_text(entry.duration_sec)+" · "+str(entry.commands)+"条指令",20)
		_button(buttons,"观看",func():_close_modal();await Bridge.command("watch",{"index":int(entry.index)}))
		_button(buttons,"导出",func():_export_record(int(entry.index)))
	if r.get("entries",[]).is_empty():_text(body,"还没有录像。完成或退出一局后会自动保存。",24)
	_button(body,"导入录像文件",_import_record)

func _export_record(index: int) -> void:
	var r:=await Bridge.command("export",{"index":index})
	if not r.has("file"):_message("导出失败",str(r.get("error","")));return
	var data:=JSON.stringify(r.file,"  ")
	if OS.has_feature("web"):JavaScriptBridge.download_buffer(data.to_utf8_buffer(),"hkvsz-replay.json","application/json")
	else:
		var dialog:=FileDialog.new();dialog.use_native_dialog=true;dialog.file_mode=FileDialog.FILE_MODE_SAVE_FILE;dialog.access=FileDialog.ACCESS_FILESYSTEM;dialog.current_file="hkvsz-replay.json";dialog.add_filter("*.json","录像 JSON");add_child(dialog)
		dialog.file_selected.connect(func(path):var f:=FileAccess.open(path,FileAccess.WRITE);if f:f.store_string(data);dialog.queue_free())
		dialog.popup_centered_ratio(.7)

func _import_record() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.HKVZPickReplay()")
		_message("导入录像","在文件选择器中选择录像，载入后将自动进入回放。")
	else:
		var dialog:=FileDialog.new();dialog.use_native_dialog=true;dialog.file_mode=FileDialog.FILE_MODE_OPEN_FILE;dialog.access=FileDialog.ACCESS_FILESYSTEM;dialog.add_filter("*.json","录像 JSON");add_child(dialog)
		dialog.file_selected.connect(func(path):
			var file: Variant=JSON.parse_string(FileAccess.get_file_as_string(path))
			if file is Dictionary:
				var r:=await Bridge.command("import",{"file":file});if not r.get("ok",false):_message("导入失败",str(r.get("error","")))
			dialog.queue_free()
		);dialog.popup_centered_ratio(.7)

func _ranking() -> void:
	var body:=_modal("排位与战绩")
	_text(body,"读取战绩中……",24)
	var r:=await Bridge.command("ranking")
	if not is_instance_valid(body):return
	_clear(body);_text(body,str(r.get("title","本地战绩"))+" · "+str(r.get("score",0)),34,PixelTheme.GOLD)
	for key in ["board","history"]:
		_text(body,"排行榜" if key=="board" else "最近战绩",26)
		var entries: Variant=r.get(key,[])
		if entries is Dictionary:entries=entries.get("entries",entries.get("matches",[]))
		if entries is Array:
			for e in entries:_wrap(body,JSON.stringify(e),18)
	if r.has("error"):_wrap(body,str(r.error),22)

func _account() -> void:
	var body:=_modal("GameHub 账号")
	_wrap(body,"网页在游戏平台内使用登录会话。Windows 版可输入账号令牌连接现有房间和战绩服务。令牌仅存于本次进程内。",24)
	var token:=LineEdit.new();token.secret=true;token.placeholder_text="账号令牌";body.add_child(token)
	_button(body,"连接账号",func():
		var r:=await Bridge.command("connect",{"token":token.text,"gameId":"4405e915c069c808"});token.clear()
		_message("账号连接","已连接" if r.get("online",false) else "未能连接，请检查令牌和网络。单机仍可正常游玩。")
	)
	_button(body,"打开账号网站",func():OS.shell_open("http://101.43.19.238/account"))

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:return
	if get_viewport().gui_get_focus_owner() is LineEdit:return
	if event.keycode==KEY_ESCAPE:
		if is_instance_valid(overlay):_close_modal()
		elif screen=="play":_pause_menu()
		return
	if screen!="play" or view.get("replay",false) or is_instance_valid(overlay):return
	if event.keycode>=KEY_1 and event.keycode<=KEY_7:
		var ids: Array=db.civs[_player().civId].units.keys();_act({"op":"spawn","unit":ids[event.keycode-KEY_1],"laneId":army_lane})
	elif event.keycode==KEY_W:_act({"op":"worker","laneId":worker_lane})
	elif event.keycode==KEY_U:_act({"op":"age"})
	elif event.keycode==KEY_B:_tab("buildings")
	elif event.keycode==KEY_SPACE:Bridge.command("pause")
	elif event.keycode==KEY_P:
		var now:=Time.get_ticks_msec()
		if now-p_pressed<650:_act({"op":"gm_beast"});p_pressed=-1000
		else:p_pressed=now

static func cost(value: Variant) -> String:
	if not value is Dictionary:return ""
	var parts:=PackedStringArray()
	for k in value:parts.append(str(JOBS.get(k,k))+str(int(value[k])))
	return " / ".join(parts)

static func clock_text(seconds: float) -> String:
	return "%02d:%02d"%[int(seconds)/60,int(seconds)%60]

func _smoke() -> void:
	await get_tree().create_timer(1).timeout
	await _capture("native-menu")
	team_size=4
	await _start_local()
	await Bridge.command("action",{"op":"worker"})
	await Bridge.command("action",{"op":"spawn","unit":"constable"})
	await get_tree().create_timer(3).timeout
	var valid: bool=view.get("state",{}).get("tick",0)>20
	print("GODOT_SMOKE ",JSON.stringify({"ok":valid,"tick":view.get("state",{}).get("tick",0),"players":view.get("state",{}).get("players",[]).size()}))
	await _capture("native-battle")
	for tab in ["workers","buildings","skills"]:
		_tab(tab);await get_tree().create_timer(.15).timeout;await _capture("native-"+tab)
	_codex("zom_necro");await _capture("native-codex")
	await Bridge.command("leave")
	get_tree().quit(0 if valid else 1)

func _capture(name: String) -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(arg.trim_prefix("--capture=").path_join(name+".png"))
