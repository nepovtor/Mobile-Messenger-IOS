import { MapPinned, MessageSquareText } from "lucide-react";
import { NavLink } from "react-router-dom";

export function WorkspaceSwitcher() {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-[26px] border border-white/10 bg-white/[0.05] p-1.5">
      <NavLink
        to="/messenger"
        className={({ isActive }) =>
          `flex items-center justify-center gap-2 rounded-[20px] px-3 py-3 text-center text-sm font-medium transition ${
            isActive
              ? "bg-white/[0.12] text-white shadow-[0_12px_30px_rgba(3,8,20,0.22)]"
              : "text-slate-400"
          }`
        }
      >
        <MessageSquareText className="h-4 w-4" />
        Messenger
      </NavLink>
      <NavLink
        to="/map"
        className={({ isActive }) =>
          `flex items-center justify-center gap-2 rounded-[20px] px-3 py-3 text-center text-sm font-medium transition ${
            isActive
              ? "bg-white/[0.12] text-white shadow-[0_12px_30px_rgba(3,8,20,0.22)]"
              : "text-slate-400"
          }`
        }
      >
        <MapPinned className="h-4 w-4" />
        Map
      </NavLink>
    </div>
  );
}
