extends Node

signal updated(view: Dictionary)
signal connected
signal failed(message: String)

var catalog: Dictionary = {}
var view: Dictionary = {}
var ready_ok := false
var busy := false
var _web: JavaScriptObject
var _server: TCPServer
var _peer: StreamPeerTCP
var _rx := PackedByteArray()
var _answers: Dictionary = {}
var _serial := 0
var _pid := -1
var _secret := ""
var _elapsed := 0.0
var _authenticated := false

func _ready() -> void:
	if OS.has_feature("web"):
		_web = JavaScriptBridge.get_interface("GodotGame")
		if _web == null:
			failed.emit("规则组件未加载，请通过完整 Web 导出页面启动。")
			return
	else:
		_server = TCPServer.new()
		var port := 49152 + randi_range(0,12000)
		var err := _server.listen(port,"127.0.0.1")
		if err != OK:
			failed.emit("本地规则服务无法启动："+error_string(err))
			return
		_secret = Crypto.new().generate_random_bytes(24).hex_encode()
		var root := ProjectSettings.globalize_path("res://") if OS.has_feature("editor") else OS.get_executable_path().get_base_dir()+"/"
		var node := root.path_join("runtime/node.exe")
		if not FileAccess.file_exists(node):
			node = OS.get_environment("HKVZ_NODE")
		if node.is_empty():
			node = "node"
		var args := PackedStringArray([root.path_join("runtime/desktop.mjs"),"--connect="+str(port),"--secret="+_secret,"--user-dir="+ProjectSettings.globalize_path("user://rules"),"--game-id=4405e915c069c808"])
		_pid = OS.create_process(node,args,false)
		if _pid < 0:
			failed.emit("缺少规则运行组件。请使用完整 Windows 包，开发时设置 HKVZ_NODE。")
			return
		var deadline := Time.get_ticks_msec()+15000
		while not _authenticated and Time.get_ticks_msec()<deadline:
			await get_tree().process_frame
		if not _authenticated:
			failed.emit("本地规则组件连接超时。")
			return
	catalog = await request_rules("catalog")
	ready_ok = not catalog.is_empty()
	connected.emit()

func _process(delta: float) -> void:
	if _server and _peer == null and _server.is_connection_available():
		_peer = _server.take_connection()
	if _peer:
		_peer.poll()
		var available := _peer.get_available_bytes()
		if available>0:
			_rx.append_array(_peer.get_data(available)[1])
			while true:
				var newline := _rx.find(10)
				if newline<0: break
				var line := _rx.slice(0,newline).get_string_from_utf8()
				_rx = _rx.slice(newline+1)
				var message: Variant = JSON.parse_string(line)
				if not message is Dictionary: continue
				if not _authenticated:
					if message.get("hello","")==_secret: _authenticated=true
					else: _peer.disconnect_from_host(); _peer=null; break
				elif message.has("id"):
					_answers[int(message.id)] = message.get("result",{})
	if not ready_ok: return
	_elapsed+=delta
	if not busy and _elapsed>=1.0/30.0:
		var ms := _elapsed*1000.0
		_elapsed=0.0
		_tick(ms)

func _tick(ms: float) -> void:
	busy=true
	var response := await request_rules("frame",{"ms":ms})
	_accept(response)
	busy=false

func _accept(response: Dictionary) -> void:
	if response.has("view"):
		view=response.view
		updated.emit(view)

func request_rules(method: String,args: Dictionary={}) -> Dictionary:
	var request := {"method":method,"args":args}
	if OS.has_feature("web"):
		var decoded: Variant = JSON.parse_string(str(_web.request(JSON.stringify(request))))
		return decoded if decoded is Dictionary else {}
	if _peer==null or not _authenticated: return {"ok":false,"error":"规则组件尚未连接"}
	_serial+=1
	var id := _serial
	request.id=id
	_peer.put_data((JSON.stringify(request)+"\n").to_utf8_buffer())
	var deadline := Time.get_ticks_msec()+20000
	while not _answers.has(id) and Time.get_ticks_msec()<deadline:
		await get_tree().process_frame
	if not _answers.has(id): return {"ok":false,"error":"规则服务请求超时"}
	var answer: Dictionary = _answers[id]
	_answers.erase(id)
	return answer

func command(method: String,args: Dictionary={}) -> Dictionary:
	var response := await request_rules(method,args)
	var deadline := Time.get_ticks_msec()+30000
	while response.has("pending") and Time.get_ticks_msec()<deadline:
		await get_tree().create_timer(0.03).timeout
		response=await request_rules("poll",{"ticket":response.pending})
	_accept(response)
	return response

func _exit_tree() -> void:
	if _peer: _peer.disconnect_from_host()
	if _server: _server.stop()
	if _pid>0 and OS.is_process_running(_pid): OS.kill(_pid)
