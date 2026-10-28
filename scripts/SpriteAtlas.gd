class_name SpriteAtlas
extends RefCounted

static var textures: Dictionary={}
static var regions: Dictionary={}
static var layout: Dictionary={}

static func texture(name: String) -> Texture2D:
	if textures.has(name): return textures[name]
	var path: String="res://assets/sprites/"+name+".png"
	if not ResourceLoader.exists(path): return null
	textures[name]=load(path)
	return textures[name]

static func frame(name: String,row: int,column: int,rows: int=7,columns: int=4) -> AtlasTexture:
	if layout.is_empty():layout=JSON.parse_string(FileAccess.get_file_as_string("res://assets/data/atlas-regions.json"))
	if layout.has(name):columns=int(layout[name].get("columns",4))
	column=clampi(column,0,columns-1)
	var key: String="%s:%d:%d:%d:%d"%[name,row,column,rows,columns]
	if regions.has(key): return regions[key]
	var tex:=texture(name)
	if tex==null: return null
	var a:=AtlasTexture.new();a.atlas=tex
	var cell:=Vector2(float(tex.get_width())/columns,float(tex.get_height())/rows)
	a.region=Rect2(Vector2(column,row)*cell,cell)
	if layout.is_empty():layout=JSON.parse_string(FileAccess.get_file_as_string("res://assets/data/atlas-regions.json"))
	if layout.has(name) and row>=0 and row<layout[name].frames.size():
		var rectangle: Array=layout[name].frames[row][column]
		a.region=Rect2(rectangle[0],rectangle[1],rectangle[2],rectangle[3])
		# Normalize each row's canvas, preserving consistent height across animation frames.
		var max_height: float=0
		var max_width: float=0
		for rect in layout[name].frames[row]:max_height=maxf(max_height,rect[3]);max_width=maxf(max_width,rect[2])
		a.margin=Rect2((max_width-rectangle[2])/2,max_height-rectangle[3],max_width-rectangle[2],max_height/0.9-rectangle[3])
	regions[key]=a
	return a

static func configured_icon(reference: String) -> Texture2D:
	if reference.is_empty():return null
	var cache_key: String="icon:"+reference
	if textures.has(cache_key):return textures[cache_key]
	var parts:=reference.split("#")
	var path: String="res://"+parts[0]
	if not ResourceLoader.exists(path):return null
	var tex: Texture2D=load(path)
	if parts.size()==2:
		var n:=parts[1].split(",")
		if n.size()!=4:return null
		var row:=int(n[0]);var column:=int(n[1]);var rows:=int(n[2]);var columns:=int(n[3])
		if rows<=0 or columns<=0 or row<0 or row>=rows or column<0 or column>=columns:return null
		if parts[0].begins_with("assets/sprites/"):
			tex=frame(parts[0].get_file().get_basename(),row,column,rows,columns)
		else:
			var a:=AtlasTexture.new();a.atlas=tex
			var cell:=Vector2(float(tex.get_width())/columns,float(tex.get_height())/rows)
			a.region=Rect2(Vector2(column,row)*cell,cell);tex=a
	textures[cache_key]=tex
	return tex

static func portrait(civ: String,unit_index: int=6,reference: String="") -> TextureRect:
	var p:=TextureRect.new();p.texture=configured_icon(reference) if not reference.is_empty() else frame(civ,unit_index,0)
	p.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	p.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	p.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	p.custom_minimum_size=Vector2(96,112)
	p.mouse_filter=Control.MOUSE_FILTER_IGNORE
	return p
