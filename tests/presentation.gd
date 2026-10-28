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
	assert(field.point(330).x<field.size.x*.11)
	assert(field.point(1470).x>field.size.x*.89)
	assert(field.unit_row({"id":1})!=field.unit_row({"id":2}))
	assert(field._visual_scale(field.point(900,1))>field._visual_scale(field.point(900,0)))
	field.free()
	print("Presentation checks passed: death retention, rewind, flank projection, depth spread and perspective")
	quit()
