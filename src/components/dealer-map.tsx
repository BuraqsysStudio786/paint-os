"use client";

import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-defaulticon-compatibility";

type Dealer={id:string;name:string;address:string;city:string;area:string;phone:string;whatsapp:string;openingHours:string;latitude:number|null;longitude:number|null};
const icon = new L.DivIcon({ className: "", html: "<span style='display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#173F32;border:3px solid #C9A45C;box-shadow:0 8px 20px rgba(0,0,0,.25)'></span>", iconSize: [28, 28], iconAnchor: [14, 28] });
const AnyMapContainer = MapContainer as unknown as React.ComponentType<Record<string, unknown>>;
const AnyTileLayer = TileLayer as unknown as React.ComponentType<Record<string, unknown>>;
const AnyMarker = Marker as unknown as React.ComponentType<Record<string, unknown>>;

function FlyTo({dealer}:{dealer?:Dealer|null}) {
  const map=useMap();
  if(dealer?.latitude&&dealer.longitude) map.flyTo([dealer.latitude,dealer.longitude], 13, { duration: .8 });
  return null;
}

export function DealerMap({dealers,activeId,onPick}:{dealers:Dealer[];activeId?:string;onPick:(id:string)=>void}) {
  const withCoords=dealers.filter(d=>d.latitude&&d.longitude);
  const center=withCoords[0]?[withCoords[0].latitude!,withCoords[0].longitude!] as [number,number]:[31.5204,74.3587] as [number,number];
  const active=dealers.find(d=>d.id===activeId);
  return <AnyMapContainer center={center} zoom={11} scrollWheelZoom className="h-[560px] w-full overflow-hidden rounded-none">
    <AnyTileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    <FlyTo dealer={active}/>
    {withCoords.map(d=><AnyMarker icon={icon} key={d.id} position={[d.latitude!,d.longitude!]} eventHandlers={{click:()=>onPick(d.id)}}>
      <Popup><strong>{d.name}</strong><br/>{d.address}<br/>{d.phone}</Popup>
    </AnyMarker>)}
  </AnyMapContainer>;
}
