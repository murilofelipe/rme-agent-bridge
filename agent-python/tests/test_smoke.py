import pytest

from app.main import run


def test_run_is_callable_but_not_implemented():
    with pytest.raises(NotImplementedError):
        run("um lago no centro do mapa")
