class_name PixelTheme
extends RefCounted

const FONT = preload("res://assets/fonts/fusion-pixel-12px.otf")
const INK := Color("17161d")
const PANEL := Color("25212a")
const PAPER := Color("ead8b0")
const GOLD := Color("d6af6b")
const DIM := Color("a99d8a")
const JADE := Color("7eb59b")
const RED := Color("b95950")

static func box(color: Color,border: Color=GOLD,width: int=2) -> StyleBoxFlat:
	var s:=StyleBoxFlat.new()
	s.bg_color=color
	s.border_color=border
	s.set_border_width_all(width)
	s.content_margin_left=12;s.content_margin_right=12
	s.content_margin_top=8;s.content_margin_bottom=8
	s.shadow_color=Color(0,0,0,0.45);s.shadow_size=3;s.shadow_offset=Vector2(3,3)
	return s

static func make() -> Theme:
	var t:=Theme.new()
	t.default_font=FONT;t.default_font_size=24
	t.set_color("font_color","Label",PAPER)
	t.set_color("font_color","Button",PAPER)
	t.set_color("font_hover_color","Button",Color.WHITE)
	t.set_color("font_disabled_color","Button",Color("746e68"))
	for type in ["Button","OptionButton"]:
		t.set_stylebox("normal",type,box(Color("332c2c"),Color("705b43")))
		t.set_stylebox("hover",type,box(Color("4c4037")))
		t.set_stylebox("pressed",type,box(Color("5a4833"),JADE))
		t.set_stylebox("disabled",type,box(Color("242126"),Color("39343a")))
		t.set_stylebox("focus",type,box(Color(0,0,0,0),JADE,1))
	t.set_stylebox("panel","PanelContainer",box(PANEL,Color("706047")))
	t.set_stylebox("background","ProgressBar",box(Color("15151a"),Color("655842"),1))
	t.set_stylebox("fill","ProgressBar",box(JADE,JADE,0))
	t.set_stylebox("normal","LineEdit",box(INK,Color("705b43")))
	t.set_color("font_color","LineEdit",PAPER)
	t.set_constant("separation","VBoxContainer",8)
	t.set_constant("separation","HBoxContainer",8)
	t.set_constant("h_separation","GridContainer",8)
	t.set_constant("v_separation","GridContainer",8)
	return t

static func label(text: String,font_size: int=24,color: Color=PAPER) -> Label:
	var l:=Label.new();l.text=text
	l.add_theme_font_size_override("font_size",font_size)
	l.add_theme_color_override("font_color",color)
	return l

static func button(text: String,callback: Callable,min_size:=Vector2(0,42)) -> Button:
	var b:=Button.new();b.text=text;b.custom_minimum_size=min_size;b.pressed.connect(callback)
	return b

static func margin(child: Control,padding: int=16) -> MarginContainer:
	var m:=MarginContainer.new()
	for side in ["left","right","top","bottom"]: m.add_theme_constant_override("margin_"+side,padding)
	m.add_child(child);return m
