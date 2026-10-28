"""Read alpha projections to describe sprite regions; never rewrites generated art."""
from PIL import Image
from pathlib import Path
import json,itertools,sys
root=Path(__file__).resolve().parents[1]
result={}
for source in (root/'assets/sprites').glob('*.png'):
    image=Image.open(source).convert('RGBA')
    width,height=image.size
    rows=6 if source.stem=='war_beasts' else 4 if source.stem in ('workers','settlements') else 7
    columns=12 if '--motion' in sys.argv and source.stem!='settlements' else 4
    alpha=image.getchannel('A')
    # Find the least occupied scanline near each nominal row separator.
    occupancy=[sum(v>80 for v in alpha.crop((0,y,width,y+1)).getdata()) for y in range(height)]
    boundaries=[0]
    for r in range(1,rows):
        nominal=height*r/rows
        candidates=range(max(boundaries[-1]+40,int(nominal-height/rows*.32)),min(height-1,int(nominal+height/rows*.32)))
        cut=min(candidates,key=lambda y:sum(occupancy[max(0,y-1):y+2])+abs(y-nominal)*.015)
        boundaries.append(cut)
    boundaries.append(height)
    # Generated rows are deliberately taller for bosses. Blank bands in the
    # three movement columns identify rows without assuming equal heights.
    quiet=[sum(v>80 for v in alpha.crop((0,y,int(width*.7),y+1)).get_flattened_data())<8 for y in range(height)]
    gaps=[]
    for valid,group in itertools.groupby(enumerate(quiet),lambda x:x[1]):
        if valid:
            indexes=[x[0] for x in group]
            if len(indexes)>2 and indexes[0]>0 and indexes[-1]<height-1:gaps.append(indexes)
    if len(gaps)==rows-1:
        boundaries=[0]+[min(g,key=lambda y:sum(occupancy[max(0,y-1):y+2])+abs(y-(g[0]+g[-1])/2)*.02) for g in gaps]+[height]
    frames=[]
    for r in range(rows):
        line=[]
        top,bottom=boundaries[r:r+2]
        # Columns may have wider attack frames; use local alpha valleys.
        column_counts=[sum(v>80 for v in alpha.crop((x,top,x+1,bottom)).getdata()) for x in range(width)]
        xs=[0]
        for c in range(1,columns):
            center=width*c/columns
            candidates=range(max(xs[-1]+2,int(center-width/columns*.12)),min(width-1,int(center+width/columns*.12)))
            xs.append(min(candidates,key=lambda x:sum(column_counts[max(0,x-1):x+2])+abs(x-center)*.015))
        xs.append(width)
        if columns==12:
            # Generated animation rows can contain extra in-betweens. Read
            # transparent gutters rather than slicing through those poses.
            spans=[]
            for occupied,group in itertools.groupby(enumerate(column_counts),lambda item:item[1]>0):
                indexes=[i for i,_ in group]
                if occupied:
                    if spans and indexes[0]-spans[-1][1]<3:spans[-1][1]=indexes[-1]+1
                    else:spans.append([indexes[0],indexes[-1]+1])
            spans=[s for s in spans if s[1]-s[0]>8]
            if len(spans)>=10:
                selected=list(range(4))+[4,5,6,7, min(8,len(spans)-3),min(9,len(spans)-3),len(spans)-2,len(spans)-1]
                for index in selected:
                    x0,x1=spans[index]
                    bounds=alpha.crop((x0,top,x1,bottom)).getbbox()
                    bx,by,ex,ey=bounds
                    line.append([x0+bx,top+by,ex-bx,ey-by])
                frames.append(line)
                continue
        for c in range(columns):
            bounds=alpha.crop((xs[c],top,xs[c+1],bottom)).point(lambda p:255 if p>80 else 0).getbbox()
            if not bounds: bounds=(0,0,xs[c+1]-xs[c],bottom-top)
            x0,y0,x1,y1=bounds
            line.append([xs[c]+x0,top+y0,x1-x0,y1-y0])
        frames.append(line)
    result[source.stem]={'size':[width,height],'rows':boundaries,'columns':columns,'frames':frames}
    print(source.stem,boundaries)
(root/'assets/data/atlas-regions.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
