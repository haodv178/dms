import hmac
import math
import os
from typing import List, Optional
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ortools.constraint_solver import routing_enums_pb2, pywrapcp

SOLVER_API_KEY = os.getenv("SOLVER_API_KEY", "").strip()

app = FastAPI(title="DMS Route Solver (Google OR-Tools)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Point(BaseModel):
    order_id: Optional[int] = None
    lat: float
    lng: float


class VrpRequest(BaseModel):
    depot: Point
    orders: List[Point]
    num_vehicles: int = 1


@app.get("/")
def health():
    return {"status": "ok", "solver": "Google OR-Tools"}


@app.post("/solve-vrp")
def solve_vrp(
    req: VrpRequest,
    x_solver_api_key: Optional[str] = Header(default=None),
):
    if SOLVER_API_KEY and not hmac.compare_digest(
        x_solver_api_key or "", SOLVER_API_KEY
    ):
        raise HTTPException(status_code=401, detail="Unauthorized solver request")

    if not req.orders:
        return {"status": "FAILED", "message": "No orders provided"}

    locations = [req.depot] + req.orders
    n = len(locations)

    # Tính ma trận khoảng cách Euclide xấp xỉ sang mét (1 độ ~ 111,000 m)
    dist_matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            d = math.hypot(
                locations[i].lat - locations[j].lat,
                locations[i].lng - locations[j].lng,
            ) * 111000
            row.append(int(d))
        dist_matrix.append(row)

    manager = pywrapcp.RoutingIndexManager(n, req.num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return dist_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = 1

    solution = routing.SolveWithParameters(search_parameters)

    if not solution:
        return {"status": "FAILED", "message": "No solution found"}

    routes = []
    for vehicle_id in range(req.num_vehicles):
        index = routing.Start(vehicle_id)
        route_stops = []
        seq = 1
        total_dist = 0
        prev_node = 0
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:  # Điểm giao hàng
                leg_dist = dist_matrix[prev_node][node]
                route_stops.append(
                    {
                        "order_id": locations[node].order_id,
                        "sequence": seq,
                        "lat": locations[node].lat,
                        "lng": locations[node].lng,
                        "distance_from_prev_meters": leg_dist,
                    }
                )
                seq += 1
                prev_node = node
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            total_dist += routing.GetArcCostForVehicle(
                previous_index, index, vehicle_id
            )

        routes.append(
            {
                "vehicle_id": vehicle_id,
                "stops": route_stops,
                "total_distance_meters": total_dist,
            }
        )

    return {"status": "SUCCESS", "routes": routes}
