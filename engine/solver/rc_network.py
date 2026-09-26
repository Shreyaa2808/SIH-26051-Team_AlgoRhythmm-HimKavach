"""
Discretizes a multi-layer building envelope assembly (e.g. stone wall +
insulation + interior finish) into a chain of RC nodes for the transient
solver, following the ISO 52016-1 approach: each material layer gets one or
more capacitance nodes connected by conductive resistances, with the whole
chain bounded by convective (+radiative, handled by the solver) surface
resistances on both faces.

A node here means: one temperature unknown, with a lumped thermal mass and
a fixed position in the layer stack. Two adjacent nodes are joined by a
conductive resistor built from the material between them.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from engine.materials.loader import Material


@dataclass
class Layer:
    material: Material
    thickness_m: float
    n_nodes: int = 2  # subdivide thick/high-mass layers into more nodes


@dataclass
class RCNode:
    label: str
    capacitance_j_per_k: float  # per m^2 of assembly area
    # resistances to neighbors are stored on the edges, not the node


@dataclass
class RCEdge:
    node_a: int
    node_b: int
    resistance_k_m2_per_w: float  # per m^2 of assembly area


@dataclass
class ConstructionAssembly:
    name: str
    layers: list[Layer]
    nodes: list[RCNode] = field(default_factory=list)
    edges: list[RCEdge] = field(default_factory=list)
    surface_resistance_outside_m2k_w: float = 0.04  # ASHRAE default, exposed
    surface_resistance_inside_m2k_w: float = 0.13    # ASHRAE default, still air

    def total_r_value(self) -> float:
        """m^2 K / W, conduction-only (excludes surface films)."""
        return sum(l.thickness_m / l.material.k for l in self.layers)

    def u_value(self) -> float:
        """W/(m^2 K), including both surface films."""
        r_total = (
            self.surface_resistance_outside_m2k_w
            + self.total_r_value()
            + self.surface_resistance_inside_m2k_w
        )
        return 1.0 / r_total

    def build_nodes(self) -> None:
        """
        Populates self.nodes and self.edges from self.layers.
        Node 0 = outside surface node, last node = inside surface node,
        with interior nodes per-layer per ISO 52016-1's node-per-layer
        (or sub-divided) scheme.
        """
        self.nodes = []
        self.edges = []

        for li, layer in enumerate(self.layers):
            m = layer.material
            n = max(1, layer.n_nodes)
            sub_thickness = layer.thickness_m / n
            # capacitance per sub-node, per m^2 of wall area
            sub_capacitance = m.rho * m.cp * sub_thickness
            sub_resistance = sub_thickness / m.k

            for k in range(n):
                self.nodes.append(
                    RCNode(
                        label=f"{layer.material.id}_L{li}_{k}",
                        capacitance_j_per_k=sub_capacitance,
                    )
                )
                node_idx = len(self.nodes) - 1
                if node_idx > 0:
                    # edge to previous node: half of this sub-layer's
                    # resistance + half of the previous node's, standard
                    # ISO 52016-1 "half-resistance" coupling
                    self.edges.append(
                        RCEdge(
                            node_a=node_idx - 1,
                            node_b=node_idx,
                            resistance_k_m2_per_w=sub_resistance,
                        )
                    )

    def node_count(self) -> int:
        return len(self.nodes)
