import numpy as np, json, math
from PIL import Image
W,H=4096,2048
X0,X1,Z0,Z1,FY,CY=-3.0,3.0,-2.0,9.0,-1.5,1.3
COL=(-1.2,4.6,0.35)  # columna x,z,r
def shade_wall(name,a,b,y):
    # a: coord horizontal, y: altura
    base={'n':(200,90,70),'s':(70,120,190),'e':(90,170,110),'w':(210,180,90)}[name]
    c=np.ones(a.shape+(3,))*np.array(base)/255
    stripe=((np.floor(a*2)%2)==0)[...,None]
    c=np.where(stripe,c*0.85,c)
    # zócalo
    c=np.where((y< -1.3)[...,None],np.array([.25,.2,.18]),c)
    # cuadros
    for ca,cy,w,h,col in [(0.0,0.2,1.2,0.8,(.95,.95,.95)),(2.2,0.1,0.6,0.9,(.1,.1,.12)),(-2.0,0.3,0.9,0.6,(.8,.2,.5))]:
        m=(abs(a-ca)<w/2)&(abs(y-cy)<h/2)
        c=np.where(m[...,None],np.array(col),c)
    return c
def render(pos,rot):
    u=(np.arange(W)+.5)/W; v=(np.arange(H)+.5)/H
    yaw=(u[None,:]-.5)*2*np.pi+rot; pit=(.5-v[:,None])*np.pi
    yaw=np.broadcast_to(yaw,(H,W)); pit=np.broadcast_to(pit,(H,W))
    dx=np.sin(yaw)*np.cos(pit); dy=np.sin(pit)*np.ones_like(yaw); dz=np.cos(yaw)*np.cos(pit)
    px,py,pz=pos
    INF=1e9; t=np.full((H,W),INF); col=np.zeros((H,W,3))
    def upd(tt,c):
        nonlocal t,col
        m=(tt>1e-4)&(tt<t)
        t=np.where(m,tt,t); col=np.where(m[...,None],c,col)
    with np.errstate(divide='ignore',invalid='ignore'):
        # piso
        tt=(FY-py)/dy; hx=px+dx*tt; hz=pz+dz*tt
        chk=((np.floor(hx*1.25)+np.floor(hz*1.25))%2)[...,None]
        c=np.where(chk>0,np.array([.62,.55,.45]),np.array([.48,.42,.34]))
        rug=(abs(hx)<1.0)&(abs(hz-3.5)<1.6)
        c=np.where(rug[...,None],np.array([.55,.15,.15]),c)
        upd(np.where(dy<0,tt,INF),c)
        # techo
        tt=(CY-py)/dy; hx=px+dx*tt; hz=pz+dz*tt
        c=np.ones((H,W,3))*.93; lamp=((hx**2+(hz-1)**2)<.15)|((hx**2+(hz-6)**2)<.15)
        c=np.where(lamp[...,None],np.array([1,1,.85]),c)
        upd(np.where(dy>0,tt,INF),c)
        # paredes
        for name,axis,val in [('n','z',Z1),('s','z',Z0),('e','x',X1),('w','x',X0)]:
            d=dz if axis=='z' else dx; p0=pz if axis=='z' else px
            tt=(val-p0)/d; hy=py+dy*tt
            ha=(px+dx*tt) if axis=='z' else (pz+dz*tt)
            c=shade_wall(name,ha,None,hy) if False else shade_wall(name,ha,None,hy)
            # puerta en pared norte
            if name=='n':
                door=(abs(ha-1.5)<0.5)&(hy<0.6)
                c=np.where(door[...,None],np.array([.35,.22,.12]),c)
            upd(np.where(d!=0,tt,INF),c)
        # columna
        cx,cz,r=COL; ox,oz=px-cx,pz-cz
        A=dx*dx+dz*dz; B=2*(ox*dx+oz*dz); C=ox*ox+oz*oz-r*r
        disc=B*B-4*A*C
        tt=np.where(disc>0,(-B-np.sqrt(np.maximum(disc,0)))/(2*A),INF)
        hx=px+dx*tt; hz=pz+dz*tt; ang=np.arctan2(hx-cx,hz-cz)
        sh=0.55+0.45*np.cos(ang-0.8)
        c=np.stack([sh*.9,sh*.9,sh*.95],-1)
        c=np.where((((ang*6/np.pi)%2)<0.15)[...,None],c*.7,c)
        upd(tt,c)
    # oscurecer con distancia
    fog=np.clip(1-t/25,0.55,1)[...,None]
    img=(np.clip(col*fog,0,1)*255).astype(np.uint8)
    return img
scenes=[('0-living',(0,0,0),0.0,'Living'),('1-centro',(0,0,3.5),0.0,'Centro'),('2-fondo',(1.8,0,6.8),1.3,'Fondo')]
def yawpitch(frm,to,rot):
    dx,dz=to[0]-frm[0],to[2]-frm[2]
    yaw=math.atan2(dx,dz)-rot; yaw=(yaw+math.pi)%(2*math.pi)-math.pi
    pitch=-math.atan2(FY,math.hypot(dx,dz))  # marzipano: pitch>0 = abajo
    return yaw,pitch
links={'0-living':['1-centro'],'1-centro':['0-living','2-fondo'],'2-fondo':['1-centro']}
data=[]
for sid,pos,rot,name in scenes:
    Image.fromarray(render(pos,rot)).save(f'panos/{sid}.jpg',quality=88)
    lh=[]
    for tg in links[sid]:
        tpos=[s for s in scenes if s[0]==tg][0][1]
        y,p=yawpitch(pos,tpos,rot); lh.append({'yaw':y,'pitch':p,'rotation':0,'target':tg})
    data.append({'id':sid,'name':name,'equirect':f'panos/{sid}.jpg','levels':[{'tileSize':512,'size':512,'fallbackOnly':True}],'faceSize':2048,
      'initialViewParameters':{'yaw':0,'pitch':0,'fov':1.4},'linkHotspots':lh,
      'infoHotspots':[{'yaw':0.9,'pitch':-0.05,'title':'Cuadro','text':'Hotspot de información de prueba'}] if sid=='0-living' else []})
out={'scenes':data,'name':'Demo','settings':{'mouseViewMode':'drag','autorotateEnabled':False,'fullscreenButton':True,'viewControlButtons':False}}
open('data.js','w').write('var APP_DATA = '+json.dumps(out,indent=2)+';\n')
print(json.dumps([ (d['id'],d['linkHotspots']) for d in data],indent=0))
