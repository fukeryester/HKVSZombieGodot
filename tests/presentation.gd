extends SceneTree

func _initialize() -> void:
	var field:=Battlefield.new()
	field.size=Vector2(1400,710)
	var unit: Dictionary={"id":1,"x":700,"hp":100,"row":0}
	var initial: Dictionary={"seed":1,"time":1.0,"players":[{},{}],"units":[unit]}
	field.update_world(initial,0,{})
	field.update_world({"seed":1,"time":1.033,"players":[{},{}],"units":[]},0,{})
	assert(field._corpses.size()==1,"Removed unit must leave a death animation")
	field.update_world({"seed":1,"time":0.0,"players":[{},{}],"units":[]},0,{})
	assert(field._corpses.is_empty(),"Rewind must clear future corpses")
	assert(is_equal_approx(float(field.layout_config.road_depth),.21))
	assert(field.point(330).x<field.point(900).x)
	assert(field.point(1470).x>field.point(900).x)
	assert(field.unit_row({"id":1})!=field.unit_row({"id":2}))
	assert(field._visual_scale(field.point(900,1))>field._visual_scale(field.point(900,0)))
	var icon:=SpriteAtlas.configured_icon("assets/sprites/hk_wild.png#0,1,7,12")
	assert(icon is AtlasTexture,"Configured atlas icon must resolve")
	assert(icon.atlas==SpriteAtlas.texture("hk_wild"))
	assert(SpriteAtlas.configured_icon("")==null)
	assert(SpriteAtlas.configured_icon("assets/sprites/missing.png")==null)
	field.free()
	print("Presentation checks passed: death retention, rewind, flank projection, depth spread and perspective")
	quit()
