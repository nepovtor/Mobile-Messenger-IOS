import { MapPinned, MessageSquareText, Server } from "lucide-react";
import { NavLink } from "react-router-dom";

export function WorkspaceSwitcher() {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-[24px] border border-white/10 bg-white/[0.06] p-1">
      <NavLink
        to="/messenger"
        className={({ isActive }) =>
          `flex items-center justify-center gap-2 rounded-[18px] px-3 py-2.5 text-center text-sm font-medium transition ${
            isActive ? "bg-white/[0.12] text-white" : "text-slate-400"
          }`
        }
      >
        <MessageSquareText className="h-4 w-4" />
        Messenger
      </NavLink>
      <NavLink
        to="/map"
        className={({ isActive }) =>
          `flex items-center justify-center gap-2 rounded-[18px] px-3 py-2.5 text-center text-sm font-medium transition ${
            isActive ? "bg-white/[0.12] text-white" : "text-slate-400"
          }`
        }
      >
        <MapPinned className="h-4 w-4" />
        Map
      </NavLink>
      <NavLink
        to="/system"
        className={({ isActive }) =>
          `flex items-center justify-center gap-2 rounded-[18px] px-3 py-2.5 text-center text-sm font-medium transition ${
            isActive ? "bg-white/[0.12] text-white" : "text-slate-400"
          }`
        }
      >
        <Server className="h-4 w-4" />
        System
      </NavLink>
    </div>
  );
}
