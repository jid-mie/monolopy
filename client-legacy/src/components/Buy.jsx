import React from "react"
import {Button} from "react-bootstrap"

class Buy extends React.Component{

  constructor(props){
    super(props)
    this.handleClick = this.handleClick.bind(this)
    this.state = {

    }
  }

  handleClick(){
    if (this.props.disabled) {
      return
    }
    this.props.handleClick()
  }

  render(){
    return(
      <div className="buy-button-div">
        <Button onClick={this.handleClick} disabled={this.props.disabled}>Buy Property</Button>
      </div>
    )
  }

}

export default Buy
